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

window.addEventListener("DOMContentLoaded", initializeAdSystemConfig);

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
        this.hideAdSlot(slotElement, "Ad size & slot not defined.");
        return Promise.resolve();
      }
    });
    try {
      await Promise.allSettled(slotPromises);
    } catch (error) {
      console.error("Error initializing ad system:", error);
    }
  }

  async loadAdForSlot(slotElement, slot) {
    try {
      // Get PID from URL query parameters if available
      const urlParams = new URLSearchParams(window.location.search);
      const pid = urlParams.get('pid');
      const bidResponse = await this.makeBidRequest(slot, pid);
      this.renderAd(slotElement, bidResponse, slot);
    } catch (error) {
      this.hideAdSlot(slotElement, "Failed to load advertisement.");
      console.error(`Ad Error [${slot.width}x${slot.height}]:`, error);
    }
  }


  async makeBidRequest(slot, pid = null) {
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

    // Add pid to the request if available
    if (pid) {
      bidRequest.pid = pid;
    }

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

  renderAd(slotElement, bidResponse, slot) {
    // Clear any previous content
    slotElement.innerHTML = "";
    
    // Determine ad type and render accordingly
    const adType = bidResponse?.ad_type;
    
    try {
      if (adType === "brand") {
        this.renderBrandAd(slotElement, bidResponse, slot);
      } else if (adType === "ortb") {
        this.renderOrtbAd(slotElement, bidResponse, slot);
      } else if (adType === "testing_pid") {
        this.renderTestingPidAd(slotElement, bidResponse, slot);
      } else {
        this.hideAdSlot(slotElement, "Unknown ad type received.");
      }
    } catch (error) {
      console.error("Error rendering ad:", error);
      this.hideAdSlot(slotElement, "Unexpected error rendering advertisement.");
    }
  }


  renderTestingPidAd(slotElement, ad, slot) {
    if (!ad || !ad.full_file_path) {
      this.hideAdSlot(slotElement, "Invalid testing_pid ad creative.");
      return;
    }
  
    try {
      // Create container elements
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
      
      // Determine if we should use video or image based on creative_type
      const isVideo = ad.creative_type === "video";
      const mediaElement = isVideo ? document.createElement("video") : document.createElement("img");
      
      // Common properties
      mediaElement.src = ad.full_file_path;
      mediaElement.style.width = "100%";
      mediaElement.style.height = "100%";
      mediaElement.style.objectFit = "contain";
      
      // Generate unique ID for this ad
      const adId = "ad-" + Math.random().toString(36).substring(2, 10);
      mediaElement.id = adId;
      
      // Video-specific properties
      if (isVideo) {
        mediaElement.controls = false;
        mediaElement.autoplay = true;
        mediaElement.muted = true;
        mediaElement.playsInline = true;
        mediaElement.loop = true;
      } else {
        mediaElement.alt = "Advertisement";
      }
      
      // Set up regular impression tracking (fires on load)
      const trackImpression = () => {
        if (ad.tracking?.impression_url) {
          this.sendImpression(ad.tracking.impression_url);
        }
      };
      
      // Set up event listeners based on media type
      if (isVideo) {
        mediaElement.addEventListener("loadeddata", trackImpression);
      } else {
        mediaElement.addEventListener("load", trackImpression);
      }
      
      // Error handling
      mediaElement.addEventListener("error", () => {
        this.hideAdSlot(slotElement, `${isVideo ? "Video" : "Image"} failed to load.`);
      });
      
      // Set up click tracking
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Track click event
        if (ad.tracking?.click_url) {
          this.sendImpression(ad.tracking.click_url).then(() => {
            // After click tracking, redirect to destination URL
            const destinationUrl = ad.tracking.destination_url || "#";
            
            // Small delay to ensure tracking completes
            setTimeout(() => {
              window.location.href = destinationUrl;
            }, 100);
          }).catch(error => {
            console.error("Click tracking failed, but still redirecting:", error);
            
            // Fallback redirect in case tracking fails
            const destinationUrl = ad.tracking.destination_url || "#";
            window.location.href = destinationUrl;
          });
        } else {
          // If no click tracking URL, redirect directly
          const destinationUrl = ad.tracking.destination_url || "#";
          window.location.href = destinationUrl;
        }
      });
      
      // Assemble the ad
      anchor.appendChild(mediaElement);
      container.appendChild(anchor);
      slotElement.appendChild(container);
      
      // Set up viewability tracking for billable impressions
      this.setupViewabilityTracking(mediaElement, () => {
        // Send billable impression when viewability criteria are met
        if (ad.tracking?.billable_impression_url) {
          this.sendImpression(ad.tracking.billable_impression_url);
        }
      });
      
    } catch (error) {
      console.error("Error rendering testing_pid ad:", error);
      this.hideAdSlot(slotElement, "Failed to render advertisement.");
    }
  }

  // Helper method to completely hide ad slots that encounter errors
  hideAdSlot(slotElement, message) {
    try {
      // Remove the ad slot from the DOM entirely
      slotElement.style.display = 'none';
      
      // Optional: Log the error for debugging
      console.warn(`Ad Slot Hidden: ${message}`);
    } catch (error) {
      console.error("Error hiding ad slot:", error);
    }
  }


  // Existing methods: renderBrandAd, renderOrtbAd, extractUrls, 
  // setupViewabilityTracking, sendImpression, replaceAuctionMacros, showError 
  // remain the same as in the previous implementation
  renderBrandAd(slotElement, ad, slot) {
    if (!ad || !ad.full_file_path) {
      this.showError(slotElement, "Invalid brand ad creative.");
      return;
    }
  
    try {
      // Create container elements
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
      
      // Determine if we should use video or image based on creative_type
      const isVideo = ad.creative_type === "video";
      const mediaElement = isVideo ? document.createElement("video") : document.createElement("img");
      
      // Common properties
      mediaElement.src = ad.full_file_path;
      mediaElement.style.width = "100%";
      mediaElement.style.height = "100%";
      mediaElement.style.objectFit = "contain";
      
      // Generate unique ID for this ad
      const adId = "ad-" + Math.random().toString(36).substring(2, 10);
      mediaElement.id = adId;
      
      // Video-specific properties
      if (isVideo) {
        mediaElement.controls = false;
        mediaElement.autoplay = true;
        mediaElement.muted = true;
        mediaElement.playsInline = true;
        mediaElement.loop = true;
      } else {
        mediaElement.alt = ad.brand_name || "Advertisement";
      }
      
      // Set up regular impression tracking (fires on load)
      const trackImpression = () => {
        if (ad.tracking?.impression_url) {
          this.sendImpression(ad.tracking.impression_url);
        }
      };
      
      // Set up event listeners based on media type
      if (isVideo) {
        mediaElement.addEventListener("loadeddata", trackImpression);
      } else {
        mediaElement.addEventListener("load", trackImpression);
      }
      
      // Error handling
      mediaElement.addEventListener("error", () => {
        this.showError(slotElement, `${isVideo ? "Video" : "Image"} failed to load.`);
      });
      
      // Set up click tracking
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        console.log(ad.tracking.destination_url);
        // Track click event
        if (ad.tracking?.click_url) {
          this.sendImpression(ad.tracking.click_url).then(() => {
            // After click tracking, redirect to destination URL
            const destinationUrl = ad.tracking.destination_url || 
                                   ad.landing_page_url || 
                                   ad.click_url || 
                                   "#";
            
            // Small delay to ensure tracking completes
            setTimeout(() => {
              window.location.href = destinationUrl;
            }, 100);
          }).catch(error => {
            console.error("Click tracking failed, but still redirecting:", error);
            
            // Fallback redirect in case tracking fails
            const destinationUrl = ad.tracking.destination_url || 
                                   ad.landing_page_url || 
                                   ad.click_url || 
                                   "#";
            
            window.location.href = destinationUrl;
          });
        } else {
          // If no click tracking URL, redirect directly
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
      
      // Set up viewability tracking for billable impressions
      this.setupViewabilityTracking(mediaElement, () => {
        // Send billable impression when viewability criteria are met
        if (ad.tracking?.billable_impression_url) {
          this.sendImpression(ad.tracking.billable_impression_url);
        }
      });
      
    } catch (error) {
      console.error("Error rendering brand ad:", error);
      this.showError(slotElement, "Failed to render advertisement.");
    }
  }

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

      // Create container for the ad
      const container = document.createElement("div");
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.overflow = "hidden";
      container.style.position = "relative";

      // Create anchor and image elements
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

      // Handle click tracking
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Send click event to update-adjourney
        this.sendImpression(this.updateJourneyUrl + "?" + new URLSearchParams({
          bid_id: bidResponse.id || bidResponse.bidid,
          event: this.EVENTS.CLICK
        }).toString());

        // Short delay to ensure tracking fires before navigation
        setTimeout(() => {
          window.location.href = urls.clickUrl;
        }, 100);
      });

      // Handle impression tracking
      img.addEventListener("load", () => {
        // Track impression URL from adm
        if (urls.impressionUrl) {
          this.sendImpression(urls.impressionUrl);
          
          // Send impression event to journey tracking
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
      
      // Set up viewability tracking for billable impressions
      this.setupViewabilityTracking(img, () => {
        // Send billable impression event when viewability criteria are met
        this.sendImpression(this.updateJourneyUrl + "?" + new URLSearchParams({
          bid_id: bidResponse.id || bidResponse.bidid,
          event: this.EVENTS.BILLED_IMPRESSION
        }).toString());
        
        // Handle billing URL when the ad is viewable
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

  extractUrls(adm) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(adm, "text/html");
      
      const anchor = doc.querySelector("a");
      const img = doc.querySelector("img");
      
      // Extract image load tracking URL from onload attribute if exists
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
   * Sets up viewability tracking for an ad element
   * @param {HTMLElement} element - The ad element to track (img or video)
   * @param {Function} callback - Function to call when viewability criteria are met
   */
  setupViewabilityTracking(element, callback) {
    // Only setup once
    if (element._viewabilityTracking) return;
    element._viewabilityTracking = true;
    
    let visibilityStart = null;
    let visibilityTimeout = null;
    let hasTriggeredBillable = false;
    
    // Set up Intersection Observer to track visibility
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

// Initialize the ad system
document.addEventListener("DOMContentLoaded", () => {
  const adSystem = new AdSystem();
  adSystem.initialize().catch(err => {
    console.error("Failed to initialize ad system:", err);
  });
});
