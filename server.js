import express from "express";
import twilio from "twilio";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const VoiceResponse = twilio.twiml.VoiceResponse;

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

// ================= ENTRY POINT =================
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: "/language",
    method: "POST"
  });
  gather.say("Press 1 for English, 2 for Hindi, 3 for Telugu, 4 for Marathi", { voice: "alice", language: "en-IN" });
  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= LANGUAGE SELECTION =================
app.post("/language", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  req.session = { language: languageMap[digit] || languageMap["1"] }; // default English

  const gather = twiml.gather({
    numDigits: 1,
    action: "/menu",
    method: "POST"
  });
  gather.say("Press 1 for Weather, 2 for Crop Price, 3 for Suitable Soil for Crop", req.session.language);
  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= MAIN MENU =================
app.post("/menu", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  req.session = req.session || {};

  if (digit === "1") {
    const gather = twiml.gather({
      numDigits: 6,
      action: "/weather",
      method: "POST"
    });
    gather.say("Please enter your 6-digit pincode", req.session.language);
  } else if (digit === "2") {
    const gather = twiml.gather({
      numDigits: 1,
      action: "/cropprice",
      method: "POST"
    });
    gather.say("Press 1 for Wheat, 2 for Rice, 3 for Maize, 4 for Sugarcane, 5 for Cotton, 6 for Potato, 7 for Tomato, 8 for Onion, 9 for Chili, 0 for Banana", req.session.language);
  } else if (digit === "3") {
    const gather = twiml.gather({
      numDigits: 1,
      action: "/soil",
      method: "POST"
    });
    gather.say("Press 1 for Red Soil, 2 for Black Soil, 3 for Alluvial Soil, 4 for Laterite Soil, 5 for Desert Soil", req.session.language);
  } else {
    twiml.say("Invalid choice", req.session.language);
    twiml.redirect("/voice");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= WEATHER =================
app.post("/weather", async (req, res) => {
  const twiml = new VoiceResponse();
  const pincode = req.body.Digits;
  const apiKey = process.env.OPENWEATHER_API_KEY;

  try {
    // 1️⃣ Today's weather
    const currentRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?zip=${pincode},IN&appid=${apiKey}&units=metric`);
    const currentData = await currentRes.json();

    if (currentData.main) {
      twiml.say(`Today's weather: ${currentData.weather[0].description}, temperature is ${currentData.main.temp} degree Celsius.`, req.session.language);
    } else {
      twiml.say("Unable to fetch today's weather.", req.session.language);
    }

    // 2️⃣ Forecast alert for next 2 days
    const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?zip=${pincode},IN&appid=${apiKey}&units=metric`);
    const forecastData = await forecastRes.json();

    if (forecastData.list) {
      const forecastDays = {};
      forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000).toLocaleDateString("en-IN", { weekday: "long" });
        if (!forecastDays[date]) forecastDays[date] = [];
        forecastDays[date].push(item);
      });

      const days = Object.keys(forecastDays).slice(1,3); // next 2 days
      let alertMessage = "";

      days.forEach(day => {
        const rainHours = forecastDays[day].filter(i => i.weather[0].main.toLowerCase().includes("rain")).length;
        const temps = forecastDays[day].map(i => i.main.temp);
        const avgTemp = Math.round(temps.reduce((a,b)=>a+b,0)/temps.length);

        if(rainHours > 0) {
          alertMessage += `${day}: Expect rain. Average temperature around ${avgTemp} degree Celsius. `;
        } else {
          alertMessage += `${day}: No significant rain expected. Average temperature around ${avgTemp} degree Celsius. `;
        }
      });

      twiml.say(`Weather alert for next days: ${alertMessage}`, req.session.language);
    }

  } catch (err) {
    twiml.say("Error fetching weather information.", req.session.language);
  }

  twiml.hangup();
  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= CROP PRICE =================
app.post("/cropprice", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const crops = Object.keys(cropPrices);
  const crop = digit === "0" ? "Banana" : crops[parseInt(digit)-1];
  twiml.say(`Price of ${crop} is ${cropPrices[crop]}`, req.session.language);
  twiml.hangup();
  res.type("text/xml");
  res.send(twiml.toString());
});

// ================= SOIL =================
app.post("/soil", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;
  const soils = Object.keys(soilCrops);
  const soil = soils[parseInt(digit)-1];
  twiml.say(`Suitable crops for ${soil} are ${soilCrops[soil]}`, req.session.language);
  twiml.hangup();
  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(3000, () => console.log("Server running on port 3000"));
