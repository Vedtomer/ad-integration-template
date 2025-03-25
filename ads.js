// Function to detect device type
function detectDeviceType() {
  const ua = navigator.userAgent;
  
  if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return /Tablet|iPad/i.test(ua) 
      ? { name: "Tablet", val: 5 } 
      : { name: "Phone", val: 4 };
  }
  if (/SmartTV|TV/i.test(ua)) return { name: "Connected TV", val: 3 };
  if (/Mac|Windows|Linux/i.test(ua)) return { name: "Personal Computer", val: 2 };
  return { name: "Connected Device", val: 6 };
}

// Dummy user details object - replace with your specific dummy data
const dummyUserDetails = {
  geo: {
    lat: 37.7749,
    lon: -122.4194,
    type: 1,
    country: "IND",
    region: "HR",
    city: "Panipat"
  },
  ipv6: "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
};

// Initialize ad system configuration
function initializeAdSystemConfig() {
  const deviceDetails = detectDeviceType();
  
  window.adSystemConfig = {
    geo: dummyUserDetails.geo,
    ipv6: dummyUserDetails.ipv6,
    deviceType: deviceDetails.val,
    deviceMake: navigator.vendor || "Unknown",
    deviceModel: navigator.platform || "Unknown",
    deviceOs: navigator.userAgentData?.platform || navigator.platform || "Unknown",
    deviceOsVersion: navigator.userAgent.match(/OS ([\d_]+)/)?.[1] || "Unknown",
    deviceCarrier: "unknown",
  };
}

// PID Validation Class
class PIDValidator {
  static async validatePID() {
    // Extract PID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get('pid');

    if (!pid) {
      console.error("No PID found in URL");
      return false;
    }

    try {
      const response = await fetch(`https://dev.ssp.verismart.ai/api/check-pid?pid=${pid}`);
      const result = await response.json();
      
      return result.success === true;
    } catch (error) {
      console.error("Error validating PID:", error);
      return false;
    }
  }
}

class AdSystem {
  constructor() {
    this.bidderUrl = "https://dev.ssp.verismart.ai/api/ssp-load-ads";
    this.updateJourneyUrl = "https://dev.ssp.verismart.ai/api/update-adjourney";
    this.adSlots = [];
    this.config = null;
    this.EVENTS = {
      IMPRESSION: "impression_at",
      BILLED_IMPRESSION: "billable_impression_at",
      CLICK: "clicked_at",
    };
    
    // Viewability criteria for billable impressions
    this.VIEWABILITY = {
      THRESHOLD: 0.5, // 50% visible
      DURATION: 1000, // 1 second (in milliseconds)
    };
  }

  async initialize() {
    // First, validate the PID
    const isPIDValid = await PIDValidator.validatePID();
    
    if (!isPIDValid) {
      console.error("PID validation failed. Ad system will not initialize.");
      return;
    }

    // Wait for configuration with exponential backoff
    let attempt = 0;
    const maxRetries = 5;
    const baseDelay = 500; // Start with shorter delay 
    
    while (typeof window.adSystemConfig === "undefined" && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }

    if (typeof window.adSystemConfig === "undefined") {
      console.error("Ad System Configuration not found after retries.");
      return;
    }

    this.config = window.adSystemConfig;
    this.adSlots = document.querySelectorAll(".ad-placeholder");

    // Process all slots in parallel
    const slotPromises = Array.from(this.adSlots).map(slotElement => {
      const width = parseInt(slotElement.dataset.width, 10) || 0;
      const height = parseInt(slotElement.dataset.height, 10) || 0;
      const slot_id = parseInt(slotElement.dataset.slot_id, 10) || 0;

      if (width && height && slot_id) {
        slotElement.style.width = `${width}px`;
        slotElement.style.height = `${height}px`;
        slotElement.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#666;font-size:12px;">Loading ad...</div>`;
        
        return this.loadAdForSlot(slotElement, { slot_id, width, height });
      } else {
        this.showError(slotElement, "Ad size & slot not defined.");
        return Promise.resolve();
      }
    });

    try {
      await Promise.allSettled(slotPromises);
    } catch (error) {
      console.error("Error initializing ad system:", error);
    }
  }

  // ... (rest of the AdSystem class remains the same as in the original script)
}

// Initialize the ad system
document.addEventListener("DOMContentLoaded", () => {
  // First, initialize the ad system configuration
  initializeAdSystemConfig();

  const adSystem = new AdSystem();
  adSystem.initialize().catch(err => {
    console.error("Failed to initialize ad system:", err);
  });
});