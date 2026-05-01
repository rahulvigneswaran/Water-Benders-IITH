/**
 * Water Benders IITH – Configuration
 *
 * After deploying your Google Apps Script (see SETUP.md),
 * paste the web app URL below.
 */
const CONFIG = {
  // ← Paste your Google Apps Script web app URL here
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwy2A2BNVYQbuO3emeCL7m9u-ecH-9TxtEATn-nvB2yVskGfkp8CR7Vt3KAbsu1DE1j_A/exec',

  APP_NAME: 'Water Benders IITH',

  // Default map center: IIT Hyderabad campus
  MAP_CENTER: [17.5937, 78.1712],
  MAP_ZOOM: 16,

  // Default refill timer (hours) shown on the Add Bowl slider
  DEFAULT_TIMER_HOURS: 8,

  // How often the app refreshes bowl data (milliseconds)
  REFRESH_INTERVAL: 60_000,   // 1 minute

  // Status thresholds as a fraction of the bowl's timer
  STATUS_ORANGE_THRESHOLD: 0.55,  // >55% elapsed → orange
  STATUS_RED_THRESHOLD:    0.85,  // >85% elapsed → red
};
