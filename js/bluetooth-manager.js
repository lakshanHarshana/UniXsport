/**
 * UniXsport - Systematic Bluetooth Connection Manager & Diagnostic Engine
 * Supports Web Bluetooth (BLE Nordic UART) and Bluetooth Serial SPP
 */

class UniXsportBluetoothManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.serialPort = null;
    this.isConnected = false;
    this.connectionType = null; // 'BLE' or 'SERIAL'
    this.onCardScannedCallback = null;
    this.onStatusChangeCallback = null;
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    
    // BLE Nordic UART Service UUIDs
    this.UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  }

  /**
   * Run Systematic Bluetooth Diagnostics
   */
  checkBrowserSupport() {
    const results = {
      webBluetoothSupported: 'bluetooth' in navigator,
      webSerialSupported: 'serial' in navigator,
      isSecureContext: window.isSecureContext,
      userAgent: navigator.userAgent
    };
    return results;
  }

  /**
   * Systematic 1-Click Wireless Bluetooth Connection
   */
  async connect(onCardScanned, onStatusChange) {
    this.onCardScannedCallback = onCardScanned;
    this.onStatusChangeCallback = onStatusChange;

    this.updateStatus('connecting', 'Initiating Systematic Bluetooth Scan...');

    // 1. Primary Method: Web Bluetooth BLE (Direct Browser Pairing)
    if ('bluetooth' in navigator) {
      try {
        console.log('[Bluetooth Manager] Requesting BLE device...');
        this.device = await navigator.bluetooth.requestDevice({
          filters: [
            { namePrefix: 'UniXsport' },
            { namePrefix: 'ESP32' }
          ],
          optionalServices: [
            this.UART_SERVICE_UUID,
            '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile
            '0000ffe0-0000-1000-8000-00805f9b34fb'  // HM-10 BLE Service
          ]
        });

        this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnection());

        console.log(`[Bluetooth Manager] Connecting to GATT Server: ${this.device.name}...`);
        this.server = await this.device.gatt.connect();

        console.log('[Bluetooth Manager] Discovering Primary GATT Services...');
        const services = await this.server.getPrimaryServices();
        
        let targetService = services.find(s => s.uuid.toLowerCase() === this.UART_SERVICE_UUID.toLowerCase()) || services[0];

        if (targetService) {
          const characteristics = await targetService.getCharacteristics();
          this.characteristic = characteristics.find(c => c.properties.notify || c.properties.indicate) || characteristics[0];

          if (this.characteristic) {
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (e) => this.handleBleDataReceived(e));
            
            this.isConnected = true;
            this.connectionType = 'BLE';
            this.reconnectAttempts = 0;
            this.updateStatus('connected', `Connected via BLE (${this.device.name})`);
            return true;
          }
        }
      } catch (bleError) {
        console.warn('[Bluetooth Manager] BLE GATT connection failed or cancelled:', bleError.message);
      }
    }

    // 2. Secondary Method: Bluetooth Virtual Serial COM Port (Classic ESP32 BluetoothSerial)
    if ('serial' in navigator) {
      try {
        console.log('[Bluetooth Manager] Falling back to Web Serial (Bluetooth COM Port)...');
        this.serialPort = await navigator.serial.requestPort();
        await this.serialPort.open({ baudRate: 115200 });

        const textDecoder = new TextDecoderStream();
        this.serialPort.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        this.isConnected = true;
        this.connectionType = 'SERIAL';
        this.reconnectAttempts = 0;
        this.updateStatus('connected', 'Connected via Bluetooth Serial Port');

        this.readSerialStream(reader);
        return true;
      } catch (serialError) {
        console.warn('[Bluetooth Manager] Serial Port connection failed:', serialError.message);
      }
    }

    this.updateStatus('disconnected', 'Bluetooth Connection Cancelled');
    return false;
  }

  /**
   * Handle incoming BLE Data Notifications
   */
  handleBleDataReceived(event) {
    const decoder = new TextDecoder('utf-8');
    const rawText = decoder.decode(event.target.value).trim();
    console.log('[Bluetooth Manager BLE Data]:', rawText);
    this.parseAndTriggerCard(rawText);
  }

  /**
   * Read incoming Bluetooth Serial stream
   */
  async readSerialStream(reader) {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep partial line
          for (let line of lines) {
            const cleanLine = line.trim();
            if (cleanLine) {
              console.log('[Bluetooth Manager Serial Line]:', cleanLine);
              this.parseAndTriggerCard(cleanLine);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Bluetooth Manager Stream Error]:', err);
      this.handleDisconnection();
    }
  }

  /**
   * Parse incoming RFID Card UID from text payload
   */
  parseAndTriggerCard(text) {
    const clean = text.toUpperCase();
    // Regex matches formats: "SCANNED RFID UID: C9E17005" or "UID: C9E17005" or raw HEX "C9E17005"
    const match = clean.match(/(?:UID:?|SCANNED RFID UID:?)\s*([A-F0-9\s]{4,})/i) || [null, clean];
    const uid = match[1].replace(/[\s\r\n]+/g, '');

    if (uid && uid.length >= 4 && /^[A-F0-9]+$/.test(uid)) {
      console.log(`[Bluetooth Manager Verified UID]: ${uid}`);
      if (this.onCardScannedCallback) {
        this.onCardScannedCallback(uid);
      }
    }
  }

  /**
   * Handle Connection Drop & Auto-Reconnect
   */
  handleDisconnection() {
    this.isConnected = false;
    this.updateStatus('disconnected', 'Bluetooth Connection Disconnected');

    if (this.autoReconnect && this.reconnectAttempts < 3 && this.device) {
      this.reconnectAttempts++;
      console.log(`[Bluetooth Manager] Attempting Auto-Reconnect (${this.reconnectAttempts}/3)...`);
      setTimeout(() => {
        if (this.device && this.device.gatt) {
          this.device.gatt.connect()
            .then(() => {
              this.isConnected = true;
              this.updateStatus('connected', `Reconnected to ${this.device.name}`);
            })
            .catch(e => console.warn('Auto-reconnect failed:', e.message));
        }
      }, 2000);
    }
  }

  /**
   * Explicit Disconnect
   */
  disconnect() {
    this.autoReconnect = false;
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    if (this.serialPort) {
      try { this.serialPort.close(); } catch (e) {}
    }
    this.isConnected = false;
    this.updateStatus('disconnected', 'Disconnected by User');
  }

  /**
   * Helper to update UI status
   */
  updateStatus(state, message) {
    console.log(`[Bluetooth Status: ${state}] ${message}`);
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(state, message, this.connectionType);
    }
  }
}

// Global Singleton Instance
window.UniXsportBluetooth = new UniXsportBluetoothManager();
