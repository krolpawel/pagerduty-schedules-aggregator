const ExcelJS = require('exceljs');
const pdClient = require('node-pagerduty');
const { exit } = require('process');
const inquirer = require('inquirer');
const { Table } = require('console-table-printer');

const CONFIG = require('./config.json');

const HOLIDAYS = [];
let pd;
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
      
      since.setUTCDate(1);
      since.setUTCHours(0, 0, 0, 0);
      until.setUTCMonth(until.getUTCMonth()+1);
      until.setUTCDate(1);
      until.setUTCDate(until.getUTCDate() -1);
      until.setUTCHours(23, 59, 59, 999);

      if(answers.dateRange === 'previous month') {
        since.setMonth(since.getMonth()-1);
        until.setMonth(until.getMonth()-1); 
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
      since: USER_DATA.schedule_since,
      until: USER_DATA.schedule_until,
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
      const endDate = new Date(entry.end);
      const currentDate = new Date(entry.start);

      currentDate.setUTCHours(10, 0, 0, 0);
      
      while (currentDate < endDate) {
        const lastSecondOfTheDay = new Date(currentDate);
        lastSecondOfTheDay.setUTCHours(23);
        lastSecondOfTheDay.setUTCMinutes(59);
        lastSecondOfTheDay.setUTCSeconds(59);
        if(lastSecondOfTheDay - currentDate > 7200000 && endDate - currentDate > 7200000) {
          const dow = currentDate.getDay();
          
          if (!Object.keys(dayCount).includes(entry.user.summary)) {
            dayCount[entry.user.summary] = {
              team: schedule.summary,
              workingDays: 0,
              holidays: 0,
              days: [],
            };
          }
          
          if ([0, 6].includes(dow) || isHoliday(currentDate)) {
            dayCount[entry.user.summary].holidays++;
          } else {
            dayCount[entry.user.summary].workingDays++;
          }
          dayCount[entry.user.summary].days.push(getDateOnlyAsString(currentDate));
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
  const date = fullDate.getUTCDate().toString().length === 1 ? `0${fullDate.getUTCDate()}` : fullDate.getUTCDate();
  return `${fullDate.getFullYear()}-${(fullDate.getUTCMonth()+1)}-${date}`;
}

const printer = async (content, screen = false, excel = false) => {
  console.log('------------------------------------------------');
  console.log(`Date range: ${getDateOnlyAsString(USER_DATA.schedule_since)} - ${getDateOnlyAsString(USER_DATA.schedule_until)}`);

  const holidaysWithinRange = HOLIDAYS
    .filter(h => h>=USER_DATA.schedule_since && h<=USER_DATA.schedule_until)
    .map(h => getDateOnlyAsString(h));
  if(!holidaysWithinRange.length) {
    console.log('No holidays withing given range');
  } else {
    console.log(`Holidays within given range: ${holidaysWithinRange}`);
  }

  const contentToPrint = CONFIG.DIVIDE_BY_TEAMS ? divideByTeam(content) : { all: content };

  if(screen) {
    Object.keys(contentToPrint).forEach(team => {
      const rows = Object.keys(contentToPrint[team]).map((key, index) => ({
        team: contentToPrint[team][key].team,
        name: key.split(' ').reverse().join(' ').trim(),
        workingDays: contentToPrint[team][key].workingDays,
        holidays: contentToPrint[team][key].holidays,
        ...(CONFIG.SHOW_DETAILS) && { details: contentToPrint[team][key].days },
      }));
      const tab = new Table({
        sort: (row1, row2) => row2.name < row1.name ? 1 : row2.name > row1.name ? -1 : 0
      });
      
      tab.addRows(rows);
      tab.printTable();
    });
  }

  if(excel) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`PD ${USER_DATA.schedule_since.getFullYear()}.${USER_DATA.schedule_since.getUTCMonth()+1}`);
    
    workbook.creator = 'PD schedule aggregator';
    workbook.created = new Date(Date.now());
    workbook.modified = new Date(Date.now());

    sheet.columns = [
      { header: 'Team', key: 'team', width: 20 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Working Days', key: 'wd' },
      { header: 'Holidays', key: 'h' },
    ];

    Object.keys(content).forEach((key) => {
      sheet.addRow({
        team: content[key].team,
        name: key.split(' ').reverse().join(' ').trim(),
        wd: content[key].workingDays,
        h: content[key].holidays,
      });
    });

    await workbook.xlsx.writeFile('./output.xlsx');
  }
};

const divideByTeam = (content) => {
  const contentDividedByTeam = {};
  Object.keys(content).forEach(item => {
    if(!contentDividedByTeam[content[item].team]) {
      contentDividedByTeam[content[item].team] = [];
    }
    contentDividedByTeam[content[item].team][item] = content[item];
  });

  console.log(contentDividedByTeam);

  return contentDividedByTeam;
}

(async () => {
  await init();
  await gatherData();
  const schedules = await getSchedules(CONFIG.SCHEDULES);
  const result = sumFinalSchedules(schedules);

  await printer(result, true, true);

})();
