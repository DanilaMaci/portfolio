---
title: Dublin Bikes availability forecasting
summary: A Django web app that maps live Dublin Bikes stations and forecasts the risk that a station runs out of bikes or docks.
problem: A station that has bikes now may be empty by the time you reach it. Riders need the risk at their arrival time, not just the current count.
role: Team of two. I built the ML model, the scheduled API scraping, the map and the design; my teammate built authentication, the database and the remaining parts.
tracks: [data, software]
stack: [Python, Django, MySQL, JavaScript, AWS EC2, AWS RDS, joblib]
result: 299k snapshots across 115 stations, split chronologically with a buffer. A persistence baseline beat the regression and gradient-boosting models on Brier score at every horizon, so the app serves the model that validated best.
image: ../../assets/projects/dublin-bikes-dashboard.jpg
imageAlt: Dublin Bikes dashboard with a route planner beside a map of Dublin, stations coloured by bike availability.
order: 1
draft: true
---

Predicting exact bike counts was reframed as risk classification: the probability that a station drops below
3 bikes or 3 free docks in 30, 60 and 120 minutes.
