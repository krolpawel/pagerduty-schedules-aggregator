const fetch = require('node-fetch');
const CONFIG = require('./config.json');
const pdClient = require('node-pagerduty');
const { exit } = require('process');
const inquirer = require('inquirer');
const { printTable } = require('console-table-printer');

let pd;
const HOLIDAYS = [];
let USER_DATA = {};

const init = async () => {
  if(!CONFIG.API_KEY || CONFIG.API_KEY === "") {
    console.log("You must provide API KEY. Check README.md for details");
    exit(1);
  }

  const token = {
    access_token: CONFIG.API_KEY,
    token_type: 'Token'
  }
  pd = new pdClient(token.access_token, token.token_type);

  prepareHolidays(CONFIG.HOLIDAYS);

  console.log(`Hi ${await getCurrentUserFullName()}!`);
}

const gatherData = async () => {
  const dateRangeQuestion = {
    type: 'list',
    name: 'dateRange',
    message: 'Date range',
    choices: ['current month', 'previous month']
  }

  await inquirer.prompt([dateRangeQuestion])
    .then(answers => {
      let since = new Date(Date.now());
      let until = new Date(Date.now());
      
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      until.setMonth(until.getMonth()+1);
      until.setDate(1);
      until.setHours(0, 0, 0, 0);
      if(answers.dateRange === 'previous month') {
        since.setMonth(since.getMonth()-1);
        until.setMonth(since.getMonth()-1); 
      }
      USER_DATA.schedule_since = since;
      USER_DATA.schedule_until = until;
    });
};

const getCurrentUserFullName = async () => {
  const { body } = await pd.users.getCurrentUser();
  return JSON.parse(body).user.name;
};

const getSchedule = async (scheduleId) => {
  const scheduleRaw = await pd.schedules.getSchedule(
    scheduleId, 
    { 
      since: getDateOnlyAsString(USER_DATA.schedule_since),
      until: getDateOnlyAsString(USER_DATA.schedule_until),
    }
  );

  return JSON.parse(scheduleRaw.body).schedule;
}

const getSchedules = async (scheduleNames) => {
  const scheduleListRaw = await pd.schedules.listSchedule({ limit: 200 });
  const scheduleList = JSON.parse(scheduleListRaw.body).schedules;

  const promises = [];
  await scheduleNames.forEach(async name => {
    const scheduleId = scheduleList.filter(object => object.name === name)[0].id;
    promises.push(getSchedule(scheduleId));
  });

  return Promise.all(promises); 
}

const sumFinalSchedules = (schedules) => {
  const dayCount = {};
  schedules.forEach(schedule => {
    const finalScheduleEntries = schedule.final_schedule.rendered_schedule_entries;
    finalScheduleEntries.forEach((entry) => {
      if (!Object.keys(dayCount).includes(entry.user.summary)) {
        dayCount[entry.user.summary] = {
          workingDays: 0,
          holidays: 0,
        };
      }
    
      const endDate = new Date(entry.end);
      const currentDate = new Date(entry.start);
      currentDate.setHours(10, 0, 0, 0);
      // console.log('entry', entry);
      while (currentDate < endDate) {
        // console.log(`1: ${currentDate} - ${endDate}`);
        const dow = currentDate.getDay();
        // console.log(`2: day of week: ${dow}`);
        if ([0, 6].includes(dow) || isHoliday(currentDate)) {
          // console.log('3: adding holiday');
          dayCount[entry.user.summary].holidays++;
        } else {
          // console.log('3: adding working day');
          dayCount[entry.user.summary].workingDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });
  });

  return dayCount;
}

const prepareHolidays = (holidays) => {
  holidays.forEach(day => {
    HOLIDAYS.push(new Date(day));
  });
};

const isHoliday = (date) => {
  return HOLIDAYS.some(holiday => getDateOnlyAsString(holiday) === getDateOnlyAsString(date));
}

const getDateOnlyAsString = (fullDate) => {
  const date = fullDate.getDate().toString().length === 1 ? `0${fullDate.getDate()}` : fullDate.getDate();
  return `${fullDate.getFullYear()}-${(fullDate.getMonth()+1)%12}-${date}`;
}

const printer = (result) => {
  console.log('------------------------------------------------');
  console.log(`Date range: ${getDateOnlyAsString(USER_DATA.schedule_since)} - ${getDateOnlyAsString(USER_DATA.schedule_until)}`);
  console.log(`Holidays withing this range: `, HOLIDAYS.filter(h => 
    h>=USER_DATA.schedule_since && h<=USER_DATA.schedule_until
  ).map(h => getDateOnlyAsString(h)));
  // console.log(result);

  //Create a table
  const table = Object.keys(result).map(key => ({
    name: key,
    workingDays: result[key].workingDays,
    holidays: result[key].holidays,
  }));
  printTable(table);
};

(async () => {
  await init();
  await gatherData();
  const schedules = await getSchedules(CONFIG.SCHEDULES);
  console.log(schedules);
  const result = sumFinalSchedules(schedules);
  printer(result);
})();
