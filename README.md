# pagerduty-schedules-aggregator
This script allows to sum up support days per person basing on Pager Duty schedules.
It can distinguish free and working days (by default saturday and sunday are considered as free and you can define your own holidays).

Disclaimer: This is MVP for now and I cannot guarantee it works ideally. However, if you find a problem with it, please create Github Issue.

## Prerequirements
1. Node
`https://nodejs.org/en/download/`

2. Yarn or NPM
`https://classic.yarnpkg.com/en/docs/install/`


## First run
1. Install dependencies
Execute below in project root folder
```
yarn
```

2. Copy config
Copy or rename `config.json.template` file to `config.json` and fill it with:
- your API key (you can find more info below)
- names of teams from PagerDuty schedules
- holidays (format: YYYY-MM-DD)

3. Run program
```
yarn start
```

## To get your API_KEY you should:
1. Log into your PagerDuty account
2. Go to My Profile -> User Settings Section
3. Click "Create API User Token"
