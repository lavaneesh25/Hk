import express from "express";
import twilio from "twilio";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const VoiceResponse = twilio.twiml.VoiceResponse;

// ================= DATA =================

// Predefined crop prices
const cropPrices = {
  "Wheat": "2000 per quintal",
  "Rice": "2500 per quintal",
  "Maize": "1800 per quintal",
  "Sugarcane": "2200 per quintal",
  "Cotton": "2300 per quintal",
  "Potato": "1500 per quintal",
  "Tomato": "2000 per quintal",
  "Onion": "1700 per quintal",
  "Chili": "3000 per quintal",
  "Banana": "1000 per quintal"
};

// Soil to crops mapping
const soilCrops = {
  "Red Soil": "Groundnut, Cotton",
  "Black Soil": "Cotton, Soybean",
  "Alluvial Soil": "Wheat, Rice",
  "Laterite Soil": "Rice, Tea",
  "Desert Soil": "Millet"
};

// Language mapping
const languageMap = {
  "1": { lang: "en-IN", voice: "alice" },
  "2": { lang: "hi-IN", voice: "alice" },
  "3": { lang: "te-IN", voice: "alice" },
  "4": { lang: "mr-IN", voice: "alice" }
};

// Safety measures mapping
const safetyTips = {
  rain: "Since heavy rain is expected, make sure to cover harvested crops, avoid water logging in fields, and strengthen drainage systems.",
  heat: "Due to high temperature, irrigate crops early morning or evening, and use mulching to conserve soil moisture.",
  cold: "Cold conditions expected. Protect seedlings with cover and irrigate properly to reduce frost damage.",
  normal: "No major weather risks detected. Continue regular farming practices."
};

// ================= ENTRY POINT =================
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: "/language",
    method: "POST"
  });
  gather.say(
    "Press 1 for English, 2 for Hindi, 3 for Telugu, 4 for Marathi",
    { voice: "alice", language: "en-IN" }
  );
  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= LANGUAGE SELECTION =================
app.post("/language", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const lang = languageMap[digit] || languageMap["1"]; // default English

  const gather = twiml.gather({
    numDigits: 1,
    action: `/menu?lang=${digit}`,
    method: "POST"
  });
  gather.say(
    "Press 1 for Weather, 2 for Crop Price, 3 for Suitable Soil for Crop, 4 to send alert to service center",
    lang
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= MAIN MENU =================
app.post("/menu", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  if (digit === "1") {
    const gather = twiml.gather({
      finishOnKey: "#",
      action: `/weather?lang=${langParam}`,
      method: "POST"
    });
    gather.say(
      "Please enter your 6-digit pincode followed by the pound key.",
      lang
    );
  } else if (digit === "2") {
    const gather = twiml.gather({
      numDigits: 1,
      action: `/cropprice?lang=${langParam}`,
      method: "POST"
    });
    gather.say(
      "Press 1 for Wheat, 2 for Rice, 3 for Maize, 4 for Sugarcane, 5 for Cotton, 6 for Potato, 7 for Tomato, 8 for Onion, 9 for Chili, 0 for Banana",
      lang
    );
  } else if (digit === "3") {
    const gather = twiml.gather({
      numDigits: 1,
      action: `/soil?lang=${langParam}`,
      method: "POST"
    });
    gather.say(
      "Press 1 for Red Soil, 2 for Black Soil, 3 for Alluvial Soil, 4 for Laterite Soil, 5 for Desert Soil",
      lang
    );
  } else if (digit === "4") {
    twiml.redirect(`/alert?lang=${langParam}`);
  } else {
    twiml.say("Invalid choice", lang);
    twiml.redirect("/voice");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= WEATHER =================
app.post("/weather", async (req, res) => {
  const twiml = new VoiceResponse();
  const pincode = req.body.Digits;
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];
  const apiKey = process.env.OPENWEATHER_API_KEY;

  try {
    // Current weather
    const currentRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?zip=${pincode},IN&appid=${apiKey}&units=metric`
    );
    const currentData = await currentRes.json();

    if (currentData.main) {
      twiml.say(
        `Today's weather: ${currentData.weather[0].description}, temperature is ${currentData.main.temp} degree Celsius.`,
        lang
      );
    } else {
      twiml.say("Unable to fetch today's weather.", lang);
    }

    // Forecast next 2 days
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?zip=${pincode},IN&appid=${apiKey}&units=metric`
    );
    const forecastData = await forecastRes.json();

    if (forecastData.list) {
      const forecastDays = {};
      forecastData.list.forEach((item) => {
        const date = new Date(item.dt * 1000).toLocaleDateString("en-IN", {
          weekday: "long",
        });
        if (!forecastDays[date]) forecastDays[date] = [];
        forecastDays[date].push(item);
      });

      const days = Object.keys(forecastDays).slice(1, 3); // next 2 days
      let alertMessage = "";
      let safetyMessage = "";

      days.forEach((day) => {
        const rainHours = forecastDays[day].filter((i) =>
          i.weather[0].main.toLowerCase().includes("rain")
        ).length;
        const temps = forecastDays[day].map((i) => i.main.temp);
        const avgTemp = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);

        if (rainHours >= 4) { // heavy rain threshold
          alertMessage += `${day}: Heavy rain expected. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.rain;
        } else if (avgTemp > 35) {
          alertMessage += `${day}: Hot conditions expected. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.heat;
        } else if (avgTemp < 10) {
          alertMessage += `${day}: Cold conditions expected. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.cold;
        } else {
          alertMessage += `${day}: No significant weather issues. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.normal;
        }
      });

      twiml.say(`Weather alert for next days: ${alertMessage}`, lang);
      twiml.say(`Recommended safety measures: ${safetyMessage}`, lang);
    }
  } catch (err) {
    twiml.say("Error fetching weather information.", lang);
  }

  twiml.hangup();
  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= CROP PRICE =================
app.post("/cropprice", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  const crops = ["Wheat","Rice","Maize","Sugarcane","Cotton","Potato","Tomato","Onion","Chili","Banana"];
  let index = parseInt(digit) - 1;
  if(digit === "0") index = 9;
  const crop = crops[index] || "Banana";

  twiml.say(`Price of ${crop} is ${cropPrices[crop]}`, lang);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= SOIL =================
app.post("/soil", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  const soils = ["Red Soil","Black Soil","Alluvial Soil","Laterite Soil","Desert Soil"];
  const soil = soils[parseInt(digit) - 1] || "Red Soil";

  twiml.say(`Suitable crops for ${soil} are ${soilCrops[soil]}`, lang);
  twiml.hangup();

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

app.listen(3000, () => console.log("Server running on port 3000"));
