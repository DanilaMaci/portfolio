// Profile content shown on the home page (story, skills, Path). Edit the copy here.

// The rest of the story after the first sentence (that one is `about` in site.ts, shared with the terminal).
export const story = [
  'As a research assistant at TRISS, I digitised Irish Stock Exchange records and wrote an R script that computes market capitalisation from them.',
  'My dissertation used difference-in-differences on AI patenting and US consumer spending.',
  'My MSc average is First Class, GPA 3.86 on a 4.2 scale.',
];
export const personal = 'Outside engineering I coach as a personal trainer at UCD Sports.';

// One line per track.
export const skills = [
  { track: 'Software', line: 'Python, Java, SQL, FastAPI, Django, PostgreSQL, Docker, GitHub Actions, AWS' },
  { track: 'Embedded', line: 'bare-metal C on AVR, STM32 and ESP32; FreeRTOS; UART, I2C, SPI' },
  { track: 'Data', line: 'Python, SQL, R, Stata, CatBoost, regression, difference-in-differences, Kalman filtering' },
];

// Education and experience in one timeline, most relevant first (not strictly chronological).
// The personal-trainer job is in the story line instead.
export const path = [
  { title: 'MSc Computer Science (conversion)', org: 'University College Dublin', dates: 'Sep 2025 – Jan 2027' },
  {
    title: 'BA Economics, 2.1',
    org: 'Trinity College Dublin',
    dates: '2020 – 2024',
    line: 'Erasmus exchange at Sciences Po.',
  },
  { title: 'Research Assistant', org: 'TRISS, Trinity College Dublin', dates: 'May 2022 – Jan 2024' },
  {
    title: 'Accounts and Tax Trainee',
    org: 'AMC Movie Production',
    dates: 'Sep 2021 – Jan 2022',
    line: 'Built an Excel VBA tool.',
  },
];
