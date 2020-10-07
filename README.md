
To get your API_KEY you should:
1. Log into your PagerDuty account
2. Go to My Profile -> User Settings Section
3. Click "Create API User Token"

To run script for the first time you need to
1. Install dependencies
```
yarn
```
2. Copy config
Copy or rename `config.json.template` file to `config.json` and fill it with:
- your API key (described above)
- names of teams from PagerDuty schedules
- holidays (format: YYYY-MM-DD)

3. Run program
```
yarn start
```
