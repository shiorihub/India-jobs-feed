# India Jobs Feed: Company Career Sites

Fresh India job openings pulled straight from company career sites, through the official public job-board APIs of Greenhouse, Lever, Ashby and SmartRecruiters. No job-board scraping, no logins, no proxies, so runs are fast, cheap and stable.

## What you get

- About 3,000 open India jobs from 91 verified employers (Bosch, Swiggy, Paytm, Okta, Zscaler, MongoDB, Stripe, Databricks, OpenAI, Razorpay, Groww, CRED, Meesho and more), with roughly 80 new postings a day.
- One clean schema across every source: title, company, department, cities, workplace type, salary when published, posted date, apply link and full description.
- City names normalised (Bangalore and Bengaluru are the same city, Gurgaon and Gurugram too).
- **Only new jobs** mode: schedule it daily and pay only for postings you have not seen.
- Add any company yourself with `ats:token`, for example `greenhouse:stripe`.

## Typical uses

- Job alerts and niche job boards for the India market
- Recruiter and staffing lead lists (who is hiring for what, right now)
- Hiring-trend and competitor research
- Feeding an AI agent or a RAG pipeline with current openings

## Input example

```json
{
  "keywords": ["data engineer", "backend"],
  "cities": ["Bengaluru", "Hyderabad"],
  "postedWithinDays": 7,
  "onlyNew": true
}
```

## Output example

```json
{
  "id": "greenhouse:coinbase:8417917",
  "ats": "greenhouse",
  "company": "Coinbase",
  "title": "Customer Support Specialist II",
  "department": "Customer Experience",
  "location": "Hyderabad, India",
  "cities": ["Hyderabad"],
  "isIndia": true,
  "isRemote": false,
  "postedAt": "2026-11-25T22:59:42.000Z",
  "url": "https://www.coinbase.com/careers/positions/8417917?gh_jid=8417917",
  "description": "..."
}
```

## Notes

- SmartRecruiters listings come without a description body; every other source includes it.
- Data comes from endpoints the ATS vendors publish for syndicating job listings. Job postings are public business information and contain no personal data.

## Local development

```
npm install
npm test
```
