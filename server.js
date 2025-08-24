import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const { VoiceResponse } = twilio.twiml;
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ... (rest of the code stays same)

// Language map
const languageMap = {
  "1": "en-IN", // English India
  "2": "hi-IN", // Hindi
  "3": "te-IN", // Telugu
};

// ================= MAIN IVR =================
app.post("/ivr", (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: "/language",
    method: "POST",
  });

  gather.say("Welcome to the Smart Farmer IVR system. Press 1 for English, 2 for Hindi, 3 for Telugu.", "en-IN");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= LANGUAGE SELECTION =================
app.post("/language", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;

  if (!languageMap[digit]) {
    twiml.say("Invalid choice. Please try again.", "en-IN");
    twiml.redirect("/ivr");
  } else {
    twiml.redirect(`/menu?lang=${digit}`);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= MAIN MENU =================
app.post("/menu", (req, res) => {
  const twiml = new VoiceResponse();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  const gather = twiml.gather({
    numDigits: 1,
    action: `/submenu?lang=${langParam}`,
    method: "POST",
  });

  gather.say("Press 1 for Weather, 2 for Crop Price, 3 for Suitable Soil for Crop", lang);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= SUBMENU HANDLER =================
app.post("/submenu", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const langParam = req.query.lang || "1";

  if (digit === "1") {
    twiml.redirect(`/weather?lang=${langParam}`);
  } else if (digit === "2") {
    twiml.redirect(`/price?lang=${langParam}`);
  } else if (digit === "3") {
    twiml.redirect(`/soil?lang=${langParam}`);
  } else {
    twiml.say("Invalid option. Returning to main menu.");
    twiml.redirect(`/menu?lang=${langParam}`);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= WEATHER =================
app.post("/weather", async (req, res) => {
  const twiml = new VoiceResponse();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=Pune&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    const data = await response.json();

    if (data.cod !== 200) throw new Error("Weather API error");

    const weather = data.weather[0].description;
    const temp = data.main.temp;

    twiml.say(`The weather in Pune is currently ${weather} with a temperature of ${temp} degrees Celsius.`, lang);

    // ✅ After weather, ask if they want to send alert
    const gather = twiml.gather({
      numDigits: 1,
      action: `/weatherMenu?lang=${langParam}`,
      method: "POST",
    });
    gather.say("If you want to send an alert to the service center about this weather, press 4. Otherwise, press any other key to return to the main menu.", lang);

  } catch (error) {
    console.error("Weather error:", error);
    twiml.say("Sorry, unable to fetch weather details right now.", lang);
    twiml.redirect(`/ivr?lang=${langParam}`);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= WEATHER SUBMENU =================
app.post("/weatherMenu", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  if (digit === "4") {
    twiml.redirect(`/alert?lang=${langParam}`);
  } else {
    twiml.redirect(`/menu?lang=${langParam}`);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= ALERT (Suggestion Only) =================
app.post("/alert", (req, res) => {
  const twiml = new VoiceResponse();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  twiml.say("Your alert suggestion has been recorded. Service center will be notified.", lang);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= PRICE =================
app.post("/price", (req, res) => {
  const twiml = new VoiceResponse();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  twiml.say("The price of wheat today is 2200 rupees per quintal.", lang);
  twiml.redirect(`/menu?lang=${langParam}`);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= SOIL =================
app.post("/soil", (req, res) => {
  const twiml = new VoiceResponse();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  twiml.say("Wheat grows best in loamy soil with good drainage.", lang);
  twiml.redirect(`/menu?lang=${langParam}`);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`IVR running on port ${PORT}`);
});
