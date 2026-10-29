---
title: Mould risk monitor
summary: An ESP32 sensor node, a Supabase pipeline and a 3D dashboard that show when a cold wall is at risk of mould and when to ventilate.
problem: Mould grows where air touches a cold surface and stays above about 80 % humidity there, so room humidity alone misses it. The risk has to be measured at the wall, in time to air the room.
role: Solo project, from the breadboard to the 3D dashboard. I'd rather see mould coming than scrub it off the wall afterwards, and a sensor network felt like the proper engineering answer to one cold wall.
tracks: [embedded, data, software]
stack: [C, ESP-IDF, ESP32, Supabase, PostgreSQL, Python, JavaScript, three.js, GitHub Actions, Cloudflare Workers]
result: Logging every minute since 6 Oct 2026. The sensor drivers are tested on the host without hardware, a pipeline monitor checks the data every minute, and the self-hosted API handled about 2000 requests/s in a local load test.
repo: https://github.com/DanilaMaci/mould-detect
live: https://mould.danilamacijauskas.dev
image: ../../assets/projects/mould-detect-dashboard.jpg
imageAlt: 3D dashboard of a living room with tiles for inside, wall, CO2 and outside conditions and a window-airing advice.
gallery:
  - image: ../../assets/projects/mould-detect-wall-panel.png
    alt: Wall panel with wall surface temperature, humidity at the wall, dew point and a 7-day chart.
    caption: The wall must stay above the orange line; below the dashed line water condenses.
  - image: ../../assets/projects/mould-detect-breadboard.jpg
    alt: ESP32 room node on a breadboard with the BME280 and SCD-40 sensors, buttons and LEDs.
    caption: The room node on its breadboard.
order: 0
draft: false
---

The live demo runs on synthetic data. Next step: the mould-risk model and the forecast, after the winter.
