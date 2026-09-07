# UniXsport - Custom Hardware Wi-Fi RFID Scanner Guide

This guide matches your **exact hardware components and pin configuration**:
- **ESP32 Dev Board**
- **RC522 RFID Reader**
- **16x2 I2C LCD Display** (SDA: GPIO 21, SCL: GPIO 22)
- **Active Buzzer** (GPIO 27)
- **Green LED** (GPIO 25 with 220Ω)
- **Red LED** (GPIO 26 with 220Ω)

---

## 📌 Complete Pin Wiring Reference

### 1. MFRC522 RFID Reader &rarr; ESP32

> [!CAUTION]
> **Power Warning:** Connect RC522 **VCC to 3.3V ONLY**. Connecting to 5V will damage the reader!

| RC522 Pin | ESP32 Pin | Wire Color Recommendation | Notes |
| :--- | :--- | :--- | :--- |
| **SDA / SS** | **GPIO 5** | Yellow | SPI Chip Select |
| **SCK** | **GPIO 18** | Orange | SPI Clock |
| **MOSI** | **GPIO 23** | Blue | SPI MOSI |
| **MISO** | **GPIO 19** | Green | SPI MISO |
| **RST** | **GPIO 4** | White | Reset |
| **VCC** | **3.3V (3V3)** | Red | 3.3V Power |
| **GND** | **GND** | Black | Ground |
| **IRQ** | *(Not Connected)* | — | Leave disconnected |

---

### 2. 16x2 I2C LCD Display &rarr; ESP32

| I2C LCD Pin | ESP32 Pin | Notes |
| :--- | :--- | :--- |
| **SDA** | **GPIO 21** | I2C Data line |
| **SCL** | **GPIO 22** | I2C Clock line |
| **VCC** | **5V / VIN** | 5V Power for bright backlight |
| **GND** | **GND** | Ground |

---

### 3. Audio & Visual Indicator Pins

| Component | ESP32 Pin | Notes |
| :--- | :--- | :--- |
| **Buzzer (+)** | **GPIO 27** | Positive pin |
| **Buzzer (-)** | **GND** | Ground |
| **Green LED (+)** | **GPIO 25** | Through 220Ω resistor (Indicates Success / Access Granted) |
| **Green LED (-)** | **GND** | Ground |
| **Red LED (+)** | **GPIO 26** | Through 220Ω resistor (Indicates Denied / Unregistered) |
| **Red LED (-)** | **GND** | Ground |

---

## 💻 Arduino IDE Setup Instructions

### 1. Install Required Arduino Libraries
Open **Arduino IDE** &rarr; Go to **Sketch** &rarr; **Include Library** &rarr; **Manage Libraries...**:

1. Search for **`MFRC522`** &rarr; Install library by **GithubCommunity**.
2. Search for **`LiquidCrystal I2C`** &rarr; Install library by **Frank de Brabander** (or Marco Schwartz).

---

### 2. Configure Wi-Fi & Server IP in [`unixsport_esp32_rfid.ino`](file:///c:/Users/laksh/Desktop/UniXsport%20-%20V-03%20(3)/UniXsport%20-%20V-03%20(2)/UniXsport%20-%20V-02/UniXsport/hardware/esp32_rfid_scanner/unixsport_esp32_rfid.ino)

Open [`unixsport_esp32_rfid.ino`](file:///c:/Users/laksh/Desktop/UniXsport%20-%20V-03%20(3)/UniXsport%20-%20V-03%20(2)/UniXsport%20-%20V-02/UniXsport/hardware/esp32_rfid_scanner/unixsport_esp32_rfid.ino) and edit lines 34–38:

```cpp
// 1. Your local Wi-Fi router details:
const char* WIFI_SSID     = "Your_Home_or_Lab_WiFi";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// 2. Your computer's local IP address running the UniXsport Node.js server:
const char* SERVER_URL    = "http://192.168.1.100:5000/api/rfid/scan";
const char* DEVICE_ID     = "STORE_GATE_01";
```

> 💡 **How to find your computer's local IP:** Open Command Prompt / PowerShell and run `ipconfig`. Look for the **IPv4 Address** (e.g. `192.168.1.100` or `192.168.8.102`).

---

### 3. Flash to ESP32
1. Connect ESP32 to PC via USB cable.
2. Select Board: **Tools &rarr; Board &rarr; ESP32 Arduino &rarr; ESP32 Dev Module**.
3. Select Port: **Tools &rarr; Port &rarr; COM#**.
4. Click **Upload** (Arrow icon).

---

## 🎬 How the System Operates:

```
                  ┌───────────────────────────────────────────────┐
                  │ 1. ESP32 boots up & connects to local Wi-Fi   │
                  │    - LCD displays IP & "Tap Card to Scan"     │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │ 2. Student / Staff taps RFID card on RC522    │
                  │    - Beeps once & LCD shows "Card Detected"   │
                  │    - Transmits UID via Wi-Fi HTTP POST        │
                  └───────────────────────┬───────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
     ┌───────────────────────────┐                 ┌───────────────────────────┐
     │ ✅ MATCH FOUND (200 OK)   │                 │ ❌ UNREGISTERED (403)     │
     │ - Green LED turns ON      │                 │ - Red LED turns ON        │
     │ - 1 Success Beep          │                 │ - 2 Warning Beeps         │
     │ - LCD: "Access Granted"   │                 │ - LCD: "Access Denied"    │
     │ - Live Web UI updates     │                 │   "Unregistered Tag"      │
     └───────────────────────────┘                 └───────────────────────────┘
```
