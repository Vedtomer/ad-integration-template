// Ad System Script - Complete Implementation

/**
 * Detect the type of device based on user agent
 * @returns {Object} Device type information
 */
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

/**
 * PID Validation Class
 */
class PIDValidator {
  /**
   * Validate the PID from the URL
   * @returns {Promise<boolean>} Whether the PID is valid
   */
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

/**
 * Dummy user details for ad configuration
 */
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

/**
 * Initialize ad system configuration
 */
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

/**
 * Ad System Class - Handles ad loading, rendering, and tracking
 */
class AdSystem {
  constructor() {
    // URLs for ad-related API endpoints
    this.bidderUrl = "https://dev.ssp.verismart.ai/api/ssp-load-ads";
    this.updateJourneyUrl = "https://dev.ssp.verismart.ai/api/update-adjourney";
    
    // Tracking event types
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

    // Ad slots and configuration
    this.adSlots = [];
    this.config = null;
  }

  /**
   * Initialize the ad system
   * @returns {Promise<void>}
   */
  async initialize() {
    // First, validate the PID
    const isPIDValid = await PIDValidator.validatePID();
    
    if (!isPIDValid) {
      //alert("PID validation failed. Ad system will not initialize");
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

    // Set configuration and find ad placeholders
    this.config = window.adSystemConfig;
    this.adSlots = document.querySelectorAll(".ad-placeholder");

    // Process all slots in parallel
    const slotPromises = Array.from(this.adSlots).map(slotElement => {
      const width = parseInt(slotElement.dataset.width, 10) || 0;
      const height = parseInt(slotElement.dataset.height, 10) || 0;
      const slot_id = parseInt(slotElement.dataset.slot_id, 10) || 0;

      if (width && height && slot_id) {
        // Set slot dimensions and add loading indicator
        slotElement.style.width = `${width}px`;
        slotElement.style.height = `${height}px`;
        slotElement.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#666;font-size:12px;">Loading ad...</div>`;
        
        // Load ad for this slot
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

  /**
   * Load ad for a specific slot
   * @param {HTMLElement} slotElement - The ad placeholder element
   * @param {Object} slot - Slot details
   * @returns {Promise<void>}
   */
  async loadAdForSlot(slotElement, slot) {
    try {
      const bidResponse = await this.makeBidRequest(slot);
      this.renderAd(slotElement, bidResponse, slot);
    } catch (error) {
      this.showError(slotElement, "Failed to load advertisement.");
      console.error(`Ad Error [${slot.width}x${slot.height}]:`, error);
    }
  }

  /**
   * Make bid request to the ad server
   * @param {Object} slot - Slot details
   * @returns {Promise<Object>} Bid response
   */
  async makeBidRequest(slot) {
    const bidRequest = {
      slot_id: slot.slot_id,
      device: {
        ua: navigator.userAgent,
        geo: this.config.geo,
        ipv6: this.config.ipv6,
        devicetype: this.config.deviceType,
        make: this.config.deviceMake,
        model: this.config.deviceModel,
        os: this.config.deviceOs,
        osv: this.config.deviceOsVersion,
        js: 1,
        carrier: this.config.deviceCarrier,
      },
    };

    try {
      const response = await fetch(this.bidderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bidRequest),
        timeout: 3000
      });

      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      return response.json();
    } catch (error) {
      console.error("Bid request failed:", error);
      throw error;
    }
  }

  /**
   * Render ad based on type
   * @param {HTMLElement} slotElement - The ad placeholder
   * @param {Object} bidResponse - Bid response from server
   * @param {Object} slot - Slot details
   */
  renderAd(slotElement, bidResponse, slot) {
    // Clear any previous content
    slotElement.innerHTML = "";
    
    // Determine ad type and render accordingly
    const adType = bidResponse?.ad_type;
    
    if (adType === "brand") {
      this.renderBrandAd(slotElement, bidResponse, slot);
    } else if (adType === "ortb") {
      this.renderOrtbAd(slotElement, bidResponse, slot);
    } else {
      this.showError(slotElement, "Unknown ad type received.");
    }
  }

  /**
   * Render brand-specific ad
   * @param {HTMLElement} slotElement - The ad placeholder
   * @param {Object} ad - Ad details
   * @param {Object} slot - Slot details
   */
  renderBrandAd(slotElement, ad, slot) {
    if (!ad || !ad.full_file_path) {
      this.showError(slotElement, "Invalid brand ad creative.");
      return;
    }
  
    try {
      // Create ad container and anchor
      const container = document.createElement("div");
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.overflow = "hidden";
      container.style.position = "relative";
      
      const anchor = document.createElement("a");
      anchor.href = "#"; // Temporary href
      anchor.style.display = "block";
      anchor.style.width = "100%";
      anchor.style.height = "100%";
      
      // Determine media type (video or image)
      const isVideo = ad.creative_type === "video";
      const mediaElement = isVideo ? document.createElement("video") : document.createElement("img");
      
      // Set media properties
      mediaElement.src = ad.full_file_path;
      mediaElement.style.width = "100%";
      mediaElement.style.height = "100%";
      mediaElement.style.objectFit = "contain";
      
      // Video-specific settings
      if (isVideo) {
        mediaElement.controls = false;
        mediaElement.autoplay = true;
        mediaElement.muted = true;
        mediaElement.playsInline = true;
        mediaElement.loop = true;
      } else {
        mediaElement.alt = ad.brand_name || "Advertisement";
      }
      
      // Impression tracking
      const trackImpression = () => {
        if (ad.tracking?.impression_url) {
          this.sendImpression(ad.tracking.impression_url);
        }
      };
      
      // Event listeners based on media type
      if (isVideo) {
        mediaElement.addEventListener("loadeddata", trackImpression);
      } else {
        mediaElement.addEventListener("load", trackImpression);
      }
      
      // Error handling
      mediaElement.addEventListener("error", () => {
        this.showError(slotElement, `${isVideo ? "Video" : "Image"} failed to load.`);
      });
      
      // Click tracking
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        
        if (ad.tracking?.click_url) {
          this.sendImpression(ad.tracking.click_url).then(() => {
            // Redirect after click tracking
            const destinationUrl = ad.tracking.destination_url || 
                                   ad.landing_page_url || 
                                   ad.click_url || 
                                   "#";
            
            setTimeout(() => {
              window.location.href = destinationUrl;
            }, 100);
          }).catch(error => {
            console.error("Click tracking failed, but still redirecting:", error);
            
            const destinationUrl = ad.tracking.destination_url || 
                                   ad.landing_page_url || 
                                   ad.click_url || 
                                   "#";
            
            window.location.href = destinationUrl;
          });
        } else {
          // Direct redirect if no click tracking
          const destinationUrl = ad.tracking.destination_url || 
                                 ad.landing_page_url || 
                                 ad.click_url || 
                                 "#";
          
          window.location.href = destinationUrl;
        }
      });
      
      // Assemble the ad
      anchor.appendChild(mediaElement);
      container.appendChild(anchor);
      slotElement.appendChild(container);
      
      // Viewability tracking
      this.setupViewabilityTracking(mediaElement, () => {
        if (ad.tracking?.billable_impression_url) {
          this.sendImpression(ad.tracking.billable_impression_url);
        }
      });
      
    } catch (error) {
      console.error("Error rendering brand ad:", error);
      this.showError(slotElement, "Failed to render advertisement.");
    }
  }

  /**
   * Render OpenRTB ad
   * @param {HTMLElement} slotElement - The ad placeholder
   * @param {Object} bidResponse - Bid response
   * @param {Object} slot - Slot details
   */
  renderOrtbAd(slotElement, bidResponse, slot) {
    const bid = bidResponse?.seatbid?.[0]?.bid?.[0];
    if (!bid) {
      this.showError(slotElement, "No valid bid received.");
      return;
    }

    try {
      const urls = this.extractUrls(bid.adm);
      if (!urls.imageUrl) {
        this.showError(slotElement, "Invalid ad creative.");
        return;
      }

      // Create ad container
      const container = document.createElement("div");
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.overflow = "hidden";
      container.style.position = "relative";

      // Create anchor and image
      const anchor = document.createElement("a");
      anchor.href = urls.clickUrl || "#";
      anchor.style.display = "block";
      anchor.style.width = "100%";
      anchor.style.height = "100%";
      
      const img = document.createElement("img");
      img.id = "ad-img-" + Math.random().toString(36).substring(2, 10);
      img.src = urls.imageUrl;
      img.alt = "Advertisement";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";

      // Click tracking
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Send click event
        this.sendImpression(this.updateJourneyUrl + "?" + new URLSearchParams({
          bid_id: bidResponse.id || bidResponse.bidid,
          event: this.EVENTS.CLICK
        }).toString());

        // Short delay to ensure tracking fires
        setTimeout(() => {
          window.location.href = urls.clickUrl;
        }, 100);
      });

      // Impression tracking
      img.addEventListener("load", () => {
        // Track impression URL
        if (urls.impressionUrl) {
          this.sendImpression(urls.impressionUrl);
          
          // Send impression event
          this.sendImpression(this.updateJourneyUrl + "?" + new URLSearchParams({
            bid_id: bidResponse.id || bidResponse.bidid,
            event: this.EVENTS.IMPRESSION
          }).toString());
        }

        // Handle win notice
        if (bid.nurl) {
          const nurlWithMacros = this.replaceAuctionMacros(bid.nurl, bidResponse);
          this.sendImpression(nurlWithMacros);
        }
      });

      // Error handling
      img.addEventListener("error", () => {
        this.showError(slotElement, "Ad image failed to load.");
      });

      // Assemble the ad
      anchor.appendChild(img);
      container.appendChild(anchor);
      slotElement.appendChild(container);
      
      // Viewability tracking
      this.setupViewabilityTracking(img, () => {
        // Send billable impression event
        this.sendImpression(this.updateJourneyUrl + "?" + new URLSearchParams({
          bid_id: bidResponse.id || bidResponse.bidid,
          event: this.EVENTS.BILLED_IMPRESSION
        }).toString());
        
        // Handle billing URL
        if (bid.burl) {
          const burlWithMacros = this.replaceAuctionMacros(bid.burl, bidResponse);
          this.sendImpression(burlWithMacros);
        }
      });
      
    } catch (error) {
      console.error("Error rendering ORTB ad:", error);
      this.showError(slotElement, "Failed to render advertisement.");
    }
  }

  /**
   * Extract URLs from ad markup
   * @param {string} adm - Ad markup
   * @returns {Object} Extracted URLs
   */
  extractUrls(adm) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(adm, "text/html");
      
      const anchor = doc.querySelector("a");
      const img = doc.querySelector("img");
      
      // Extract image load tracking URL
      let impressionUrl = null;
      const onloadAttr = img?.getAttribute("onload");
      if (onloadAttr) {
        const match = onloadAttr.match(/sendUrl\('([^']+)'\)/);
        impressionUrl = match?.[1] || null;
      }
      
      return {
        clickUrl: anchor?.href || null,
        imageUrl: img?.src || null,
        impressionUrl: impressionUrl
      };
    } catch (error) {
      console.error("Error extracting URLs from ad markup:", error);
      return { clickUrl: null, imageUrl: null, impressionUrl: null };
    }
  }

  /**
   * Setup viewability tracking for an ad element
   * @param {HTMLElement} element - Ad element to track
   * @param {Function} callback - Function to call on viewability
   */
  setupViewabilityTracking(element, callback) {
    // Prevent duplicate tracking
    if (element._viewabilityTracking) return;
    element._viewabilityTracking = true;
    
    let visibilityStart = null;
    let visibilityTimeout = null;
    let hasTriggeredBillable = false;
    
    // Intersection Observer for visibility tracking
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      
      if (entry.isIntersecting && entry.intersectionRatio >= this.VIEWABILITY.THRESHOLD) {
        // Element is at least 50% visible
        if (!visibilityStart) {
          visibilityStart = performance.now();
          
          // Set timeout for minimum viewable duration
          visibilityTimeout = setTimeout(() => {
            if (!hasTriggeredBillable) {
              hasTriggeredBillable = true;
              callback();
              observer.disconnect();
            }
          }, this.VIEWABILITY.DURATION);
        }
      } else {
        // Element is less than 50% visible
        if (visibilityStart) {
          // Reset tracking
          clearTimeout(visibilityTimeout);
          visibilityStart = null;
        }
      }
    }, {
      threshold: [this.VIEWABILITY.THRESHOLD]
    });
    
    // Start observing
    observer.observe(element);
    
    // Clean up on page unload
    window.addEventListener("beforeunload", () => {
      observer.disconnect();
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }
    }, { once: true });
  }

  /**
   * Send impression tracking pixel
   * @param {string} url - Tracking URL
   * @returns {Promise<void>}
   */
  sendImpression(url) {
    if (!url) return Promise.resolve();
    
    // Use fetch with GET method for impression tracking
    return fetch(url, {
      method: "GET",
      mode: "no-cors",
      credentials: "omit",
      keepalive: true,
      cache: "no-store"
    }).catch(err => {
      console.warn("Impression tracking failed:", err);
    });
  }

  /**
   * Replace auction macros in URLs
   * @param {string} url - URL with macros
   * @param {Object} bidResponse - Bid response
   * @returns {string} URL with macros replaced
   */
  replaceAuctionMacros(url, bidResponse) {
    if (!url || !bidResponse?.seatbid?.[0]?.bid?.[0]) return url;
    
    const bid = bidResponse.seatbid[0].bid[0];
    const macros = {
      "${AUCTION_ID}": bidResponse.id || bidResponse.bidid || "",
      "${AUCTION_BID_ID}": bid.id || "",
      "${AUCTION_IMP_ID}": bid.impid || "",
      "${AUCTION_SEAT_ID}": bidResponse.seatbid[0].seat || "",
      "${AUCTION_PRICE}": bid.price?.toString() || "",
      "${AUCTION_CURRENCY}": bidResponse.cur || "",
      "${AUCTION_MBR}": "",
      "${AUCTION_AD_ID}": bid.adid || "",
      "${AUCTION_LOSS}": ""
    };
    
    return Object.entries(macros).reduce((acc, [macro, value]) => {
      return acc.replace(new RegExp(macro.replace(/\$/g, "\\$"), "g"), value);
    }, url);
  }

  /**
   * Show error message in ad slot
   * @param {HTMLElement} slotElement - The ad placeholder
   * @param {string} message - Error message
   */
  showError(slotElement, message) {
    slotElement.innerHTML = `
      <div class="ad-error" style="
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8f8f8;
        color: #888;
        font-size: 12px;
        text-align: center;
        border: 1px solid #ddd;
      ">
        <span>${message}</span>
      </div>
    `;
  }
}

// Initialize the ad system when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // First, initialize the ad system configuration
  initializeAdSystemConfig();

  // Create and initialize ad system
  const adSystem = new AdSystem();
  adSystem.initialize().catch(err => {
    console.error("Failed to initialize ad system:", err);
  });
});