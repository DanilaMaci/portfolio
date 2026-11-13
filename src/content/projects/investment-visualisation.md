---
title: Irish investing planner
summary: A browser planner for Irish personal investing that shows low, typical and high outcomes over 40 years for the new Savings and Investment Account, an investing account, cash and buying a home.
problem: From 2027 Ireland plans a new Savings and Investment Account, on top of income tax, exit tax and first-time-buyer schemes. Seeing what a monthly amount could become, and how a home purchase changes it, means simulating many possible futures, not one average return.
role: Solo project. The simulation engine, the Irish tax and scheme rules with their sources, the dashboard, and independent Python recomputation of the engine's numbers.
tracks: [software, data]
stack: [TypeScript, React, Web Workers, Vite, Vitest, Playwright, Python, Cloudflare Workers]
repo: https://github.com/DanilaMaci/investment-visualisation
live: https://invest.danilamacijauskas.dev
image: ../../assets/projects/investment-visualisation-plan.png
imageAlt: Plan tab with everything you could own in 2046, a bad-luck to good-luck range and a chart of 5,000 simulated futures from 2027 to 2066.
gallery:
  - image: ../../assets/projects/investment-visualisation-money.png
    alt: Money tab for 2031 listing pay after tax, mortgage, upkeep and spending, and what was kept in the SIA, investing account and mortgage.
    caption: Where the money goes in one year, and every year so far.
  - image: ../../assets/projects/investment-visualisation-compare.png
    alt: Costs by 2046, a buy-or-rent-and-invest comparison and a table comparing five home prices.
    caption: Buy or rent and invest, and the same plan at five home prices.
order: 1
draft: false
---

Early version, for illustration only: not financial advice. The 2027 rules are announced budget measures and may
change; each one lives in one file with its source and date. Everything runs in the browser; answers are not sent anywhere.
