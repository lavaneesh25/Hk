import express from "express";
import twilio from "twilio";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const VoiceResponse = twilio.twiml.VoiceResponse;

// Twilio REST client for SMS
const smsClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/* ================= DATA ================= */

// Predefined crop prices
const cropPrices = {
  Wheat: "2000 per quintal",
  Rice: "2500 per quintal",
  Maize: "1800 per quintal",
  Sugarcane: "2200 per quintal",
  Cotton: "2300 per quintal",
  Potato: "1500 per quintal",
  Tomato: "2000 per quintal",
  Onion: "1700 per quintal",
  Chili: "3000 per quintal",
  Banana: "1000 per quintal",
};

// Soil to crops mapping
const soilCrops = {
  "Red Soil": "Groundnut, Cotton",
  "Black Soil": "Cotton, Soybean",
  "Alluvial Soil": "Wheat, Rice",
  "Laterite Soil": "Rice, Tea",
  "Desert Soil": "Millet",
};

// Twilio language/voice mapping (use "alice" with regional languages)
const languageMap = {
  "1": { voice: "alice", language: "en-IN" }, // English (India)
  "2": { voice: "alice", language: "hi-IN" }, // Hindi
  "3": { voice: "alice", language: "te-IN" }, // Telugu
  "4": { voice: "alice", language: "mr-IN" }, // Marathi
};

// Crop-focused weather safety tips
const safetyTips = {
  rain:
    "Ensure proper drainage to avoid water logging. Avoid fertilizer application during rain. Delay harvesting if possible.",
  heat:
    "Irrigate crops in early morning or evening. Use mulching to conserve soil moisture. Avoid pesticide sprays during peak heat.",
  cold:
    "Protect seedlings with crop covers. Prefer daytime irrigation to reduce frost damage. Avoid water stagnation near roots.",
  normal:
    "No major weather risks detected. Continue routine crop care and regular field scouting.",
};

// Simple soil farming tips (added to soil option)
const soilTips = {
  "Red Soil": "Add organic matter and schedule frequent light irrigation to improve moisture retention.",
  "Black Soil": "Ensure good drainage and avoid waterlogging; ideal for cotton—monitor for pests.",
  "Alluvial Soil": "Balanced fertilization improves yields; suitable for cereals like wheat and rice.",
  "Laterite Soil": "Apply lime if soil is acidic and maintain regular irrigation for paddy or tea.",
  "Desert Soil": "Use drip irrigation and mulching to conserve scarce moisture; pick drought-tolerant crops.",
};

/* ================= ENTRY POINT ================= */
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: "/language",
    method: "POST",
  });
  gather.say(
    "Press 1 for English, 2 for Hindi, 3 for Telugu, 4 for Marathi",
    { voice: "alice", language: "en-IN" }
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

/* ================= LANGUAGE SELECTION ================= */
app.post("/language", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = (req.body.Digits || "").trim();
  const langKey = ["1", "2", "3", "4"].includes(digit) ? digit : "1";
  const lang = languageMap[langKey];

  const gather = twiml.gather({
    numDigits: 1,
    action: `/menu?lang=${langKey}`,
    method: "POST",
  });
  gather.say(
    "Press 1 for Weather, 2 for Crop Price, 3 for Suitable Soil for Crop",
    lang
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

/* ================= MAIN MENU ================= */
app.post("/menu", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = (req.body.Digits || "").trim();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  if (digit === "1") {
    const gather = twiml.gather({
      finishOnKey: "#",
      action: `/weather?lang=${langParam}`,
      method: "POST",
    });
    gather.say(
      "Please enter your 6 digit pincode followed by the pound key.",
      lang
    );
  } else if (digit === "2") {
    const gather = twiml.gather({
      numDigits: 1,
      action: `/cropprice?lang=${langParam}`,
      method: "POST",
    });
    gather.say(
      "Press 1 for Wheat, 2 for Rice, 3 for Maize, 4 for Sugarcane, 5 for Cotton, 6 for Potato, 7 for Tomato, 8 for Onion, 9 for Chili, 0 for Banana",
      lang
    );
  } else if (digit === "3") {
    const gather = twiml.gather({
      numDigits: 1,
      action: `/soil?lang=${langParam}`,
      method: "POST",
    });
    gather.say(
      "Press 1 for Red Soil, 2 for Black Soil, 3 for Alluvial Soil, 4 for Laterite Soil, 5 for Desert Soil",
      lang
    );
  } else {
    twiml.say("Invalid choice", lang);
    twiml.redirect("/voice");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

/* ================= WEATHER (LIVE) ================= */
app.post("/weather", async (req, res) => {
  const twiml = new VoiceResponse();
  const pincode = (req.body.Digits || "").replace(/\D/g, "");
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!/^\d{6}$/.test(pincode)) {
    twiml.say("Invalid pincode. Please try again.", lang);
    twiml.redirect(`/menu?lang=${langParam}`);
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  try {
    // Current weather
    const currentRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?zip=${pincode},IN&appid=${apiKey}&units=metric`
    );
    const currentData = await currentRes.json();

    if (currentData?.main && currentData?.weather?.[0]) {
      twiml.say(
        `Today's weather: ${currentData.weather[0].description}, temperature is ${Math.round(
          currentData.main.temp
        )} degree Celsius.`,
        lang
      );
    } else {
      twiml.say("Unable to fetch today's weather.", lang);
    }

    // 5-day/3-hour forecast; we’ll compute next 2 days overview
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?zip=${pincode},IN&appid=${apiKey}&units=metric`
    );
    const forecastData = await forecastRes.json();

    if (forecastData?.list?.length) {
      // bucket by weekday label
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
        const slots = forecastDays[day];
        const rainHours = slots.filter((i) =>
          (i.weather?.[0]?.main || "").toLowerCase().includes("rain")
        ).length;
        const temps = slots
          .map((i) => i.main?.temp)
          .filter((t) => typeof t === "number");
        const avgTemp =
          temps.length > 0
            ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
            : null;

        if (rainHours >= 4) {
          alertMessage += `${day}: Heavy rain expected. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.rain;
        } else if (avgTemp !== null && avgTemp > 35) {
          alertMessage += `${day}: Hot conditions expected. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.heat;
        } else if (avgTemp !== null && avgTemp < 10) {
          alertMessage += `${day}: Cold conditions expected. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.cold;
        } else {
          alertMessage += `${day}: No significant weather issues. Average temperature ${avgTemp} degree Celsius. `;
          safetyMessage = safetyTips.normal;
        }
      });

      twiml.say(`Weather alert for next days: ${alertMessage}`, lang);
      twiml.say(`Recommended crop safety measures: ${safetyMessage}`, lang);

      // Ask if user wants to send SMS alert to service center
      const gather = twiml.gather({
        numDigits: 1,
        action: `/weatherAlert?lang=${langParam}&msg=${encodeURIComponent(
          alertMessage + " " + safetyMessage
        )}`,
        method: "POST",
      });
      gather.say(
        "Do you want me to send this alert to the service center? Press 1 for Yes, 2 for No.",
        lang
      );

      res.type("text/xml");
      return res.send(twiml.toString());
    } else {
      twiml.say("Unable to fetch forecast information.", lang);
      twiml.hangup();
      res.type("text/xml");
      return res.send(twiml.toString());
    }
  } catch (err) {
    console.error("Weather fetch error:", err);
    twiml.say("Error fetching weather information.", lang);
    twiml.hangup();
    res.type("text/xml");
    return res.send(twiml.toString());
  }
});

/* ============ WEATHER ALERT DECISION (Yes/No) ============ */
app.post("/weatherAlert", async (req, res) => {
  const twiml = new VoiceResponse();
  const digit = (req.body.Digits || "").trim();
  const langParam = req.query.lang || "1";
  const msg = decodeURIComponent(req.query.msg || "");
  const lang = languageMap[langParam] || languageMap["1"];

  if (digit === "1") {
    // SEND SMS to service center
    try {
      await smsClient.messages.create({
        body: `Weather Alert: ${msg}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: "+919398650755", // service center number
      });
      twiml.say("Alert has been sent to the service center.", lang);
    } catch (err) {
      console.error("SMS send error:", err);
      twiml.say("Failed to send alert. Please try again later.", lang);
    }
    twiml.hangup();
  } else if (digit === "2") {
    twiml.say("Okay, no alert will be sent.", lang);
    twiml.hangup();
  } else {
    // invalid input → ask again
    const gather = twiml.gather({
      numDigits: 1,
      action: `/weatherAlert?lang=${langParam}&msg=${encodeURIComponent(msg)}`,
      method: "POST",
    });
    gather.say("Invalid input. Press 1 to send the alert, or 2 to skip.", lang);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

/* ================= CROP PRICE ================= */
app.post("/cropprice", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = (req.body.Digits || "").trim();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  const crops = [
    "Wheat",
    "Rice",
    "Maize",
    "Sugarcane",
    "Cotton",
    "Potato",
    "Tomato",
    "Onion",
    "Chili",
    "Banana",
  ];

  let index = parseInt(digit, 10) - 1;
  if (digit === "0") index = 9;
  const crop = crops[index] || "Banana";

  const storageTip =
    "Store harvested grains in a clean, dry, covered place to prevent moisture and pest damage.";

  twiml.say(`Price of ${crop} is ${cropPrices[crop]}. ${storageTip}`, lang);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

/* ================= SOIL ================= */
app.post("/soil", (req, res) => {
  const twiml = new VoiceResponse();
  const digit = (req.body.Digits || "").trim();
  const langParam = req.query.lang || "1";
  const lang = languageMap[langParam] || languageMap["1"];

  const soils = [
    "Red Soil",
    "Black Soil",
    "Alluvial Soil",
    "Laterite Soil",
    "Desert Soil",
  ];
  const soil = soils[parseInt(digit, 10) - 1] || "Red Soil";

  const crops = soilCrops[soil];
  const tip = soilTips[soil] || "Follow best agronomic practices for your field conditions.";

  twiml.say(`Suitable crops for ${soil} are ${crops}. Tip: ${tip}`, lang);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
