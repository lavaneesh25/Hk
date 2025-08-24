import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const { VoiceResponse } = twilio.twiml;

// 🌐 Language Map
const languageMap = {
  "1": "en-IN",  // English
  "2": "hi-IN",  // Hindi
  "3": "te-IN",  // Telugu
  "4": "mr-IN"   // Marathi
};

// 🌾 Crop Safety Tips
const safetyTips = {
  rain: "Ensure proper drainage to avoid water logging. Avoid applying fertilizers during rain.",
  heat: "Irrigate crops early morning or evening. Use mulching to retain soil moisture.",
  cold: "Protect seedlings with crop covers. Avoid irrigation at night to prevent frost.",
  normal: "Conditions are normal. Continue regular crop care."
};

// 💰 Example Crop Prices (static)
const cropPrices = {
  rice: "₹50 per kilogram",
  wheat: "₹40 per kilogram",
  maize: "₹30 per kilogram",
  cotton: "₹65 per kilogram",
  sugarcane: "₹3 per kilogram",
  pulses: "₹90 per kilogram",
  soybean: "₹55 per kilogram",
  groundnut: "₹70 per kilogram",
  onion: "₹25 per kilogram",
  potato: "₹20 per kilogram"
};

// 🌱 Soil → Crops mapping
const soilToCrops = {
  black: "Cotton, Soybean, Sorghum, and Wheat are best for black soil.",
  red: "Groundnut, Millets, and Pulses grow well in red soil.",
  alluvial: "Rice, Wheat, Sugarcane, and Jute are best for alluvial soil.",
  laterite: "Cashew, Coffee, Rubber, and Coconut are suitable for laterite soil.",
  desert: "Millets, Barley, and Pulses can grow in desert soil with irrigation."
};

const OPENWEATHER_API = process.env.OPENWEATHER_API_KEY;

// 🟢 Entry: Language selection
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ numDigits: 1, action: "/menu", method: "POST" });

  gather.say("Welcome to Smart Agro Assistant. Press 1 for English, 2 for Hindi, 3 for Telugu, 4 for Marathi.");
  
  res.type("text/xml");
  res.send(twiml.toString());
});

// 🟢 After selecting language
app.post("/menu", (req, res) => {
  const digit = req.body.Digits;
  const twiml = new VoiceResponse();

  if (languageMap[digit]) {
    const gather = twiml.gather({
      numDigits: 1,
      action: `/mainMenu?lang=${digit}`,
      method: "POST"
    });

    gather.say({ language: languageMap[digit] }, "Press 1 for Weather, 2 for Crop Prices, 3 for Suitable Crops by Soil Type.");
  } else {
    twiml.say("Invalid choice. Goodbye!");
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// 🟢 Main Menu
app.post("/mainMenu", (req, res) => {
  const choice = req.body.Digits;
  const lang = req.query.lang || "1";
  const twiml = new VoiceResponse();

  if (choice === "1") {
    const gather = twiml.gather({
      input: "speech",
      action: `/weather?lang=${lang}`,
      method: "POST"
    });
    gather.say({ language: languageMap[lang] }, "Please say or enter your pincode.");
  } else if (choice === "2") {
    const prices = Object.entries(cropPrices)
      .map(([crop, price]) => `${crop}: ${price}`)
      .join(". ");
    twiml.say({ language: languageMap[lang] }, `Here are some crop prices. ${prices}`);
  } else if (choice === "3") {
    const gather = twiml.gather({
      input: "speech",
      action: `/soil?lang=${lang}`,
      method: "POST"
    });
    gather.say({ language: languageMap[lang] }, "Please say your soil type, like black, red, alluvial, laterite, or desert.");
  } else {
    twiml.say("Invalid choice. Goodbye!");
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// 🟢 Weather option
app.post("/weather", async (req, res) => {
  const lang = req.query.lang || "1";
  const speechResult = req.body.SpeechResult || "411057"; // default Pune Infosys
  const twiml = new VoiceResponse();

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?zip=${speechResult},IN&appid=${OPENWEATHER_API}&units=metric`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.cod !== 200) {
      twiml.say({ language: languageMap[lang] }, "Sorry, could not fetch weather for the given pincode.");
    } else {
      const temp = data.main.temp;
      const weather = data.weather[0].main.toLowerCase();

      let safetyMessage = safetyTips.normal;
      if (weather.includes("rain")) safetyMessage = safetyTips.rain;
      else if (temp > 35) safetyMessage = safetyTips.heat;
      else if (temp < 10) safetyMessage = safetyTips.cold;

      twiml.say(
        { language: languageMap[lang] },
        `The current temperature is ${temp} degrees Celsius with ${weather}. Crop safety advice: ${safetyMessage}. Alert will be sent to service center.`
      );
    }
  } catch (error) {
    console.error(error);
    twiml.say({ language: languageMap[lang] }, "Error retrieving weather information.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// 🟢 Soil option
app.post("/soil", (req, res) => {
  const lang = req.query.lang || "1";
  const soilType = (req.body.SpeechResult || "").toLowerCase();
  const twiml = new VoiceResponse();

  const response = soilToCrops[soilType];
  if (response) {
    twiml.say({ language: languageMap[lang] }, response);
  } else {
    twiml.say({ language: languageMap[lang] }, "Sorry, I could not identify that soil type.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// 🟢 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
