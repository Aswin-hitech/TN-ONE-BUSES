
    document.addEventListener("DOMContentLoaded", async () => {
      // 1. Initialize Auth
      const authContainer = document.getElementById("topbar-auth");
      const status = await TNAuth.getStatus();
      TNAuth.renderTopbarAuth(authContainer, status);

      // 2. Initialize Map (Center of Tamil Nadu)
      const map = L.map("map", {
        zoomControl: false
      }).setView([11.1271, 78.6569], 7);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      L.control.zoom({ position: "bottomleft" }).addTo(map);

      let userMarker = null;
      let routingControl = null;
      let fallbackRoute = null;
      let originMarker = null;
      let destMarker = null;

      const originInput = document.getElementById("origin-input");
      const destInput = document.getElementById("destination-input");
      const searchBtn = document.getElementById("search-route-btn");
      const locateBtn = document.getElementById("locate-btn");

      // Bottom Panel Elements
      const busPanel = document.getElementById("bus-bottom-panel");
      const busPanelHeader = document.getElementById("bus-panel-header");
      const busPanelHandle = document.getElementById("bus-panel-handle");
      const panelRouteTitle = document.getElementById("panel-route-title");
      const panelDistanceBadge = document.getElementById("panel-distance-badge");
      const panelToggleBtn = document.getElementById("panel-toggle-btn");
      const panelBusList = document.getElementById("panel-bus-list");
      const panelBusCount = document.getElementById("panel-bus-count");
      const panelAddBusBtn = document.getElementById("panel-add-bus-btn");
      const panelBusesMap = new Map();

      // Panel Expand/Collapse Toggle
      let isPanelExpanded = false;
      function togglePanel(expand) {
        if (expand !== undefined) {
          isPanelExpanded = expand;
        } else {
          isPanelExpanded = !isPanelExpanded;
        }
        busPanel.classList.toggle("expanded", isPanelExpanded);
        const toggleIcon = panelToggleBtn.querySelector(".toggle-icon");
        const toggleText = panelToggleBtn.querySelector(".toggle-text");
        if (isPanelExpanded) {
          toggleIcon.textContent = "▼";
          toggleText.textContent = "Collapse";
        } else {
          toggleIcon.textContent = "▲";
          toggleText.textContent = "View Buses";
        }
      }

      busPanelHeader.addEventListener("click", () => togglePanel());
      busPanelHandle.addEventListener("click", () => togglePanel());

      // Stop Autocomplete
      setupAutocomplete(originInput, () => {
        if (destInput.value.trim()) triggerRouteFlow();
      });
      setupAutocomplete(destInput, () => {
        triggerRouteFlow();
      });

      destInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && destInput.value.trim()) {
          e.preventDefault();
          triggerRouteFlow();
        }
      });

      originInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && destInput.value.trim()) {
          e.preventDefault();
          triggerRouteFlow();
        }
      });

      searchBtn.addEventListener("click", () => {
        const from = originInput.value.trim();
        const to = destInput.value.trim();
        if (!to && !from) {
          alert("Please enter a destination to find buses.");
          destInput.focus();
          return;
        }
        if (to) {
          triggerRouteFlow();
        } else {
          window.location.href = `search.html?from=${encodeURIComponent(from)}`;
        }
      });

      // Main Orchestration Flow
      async function triggerRouteFlow() {
        const from = originInput.value.trim() || "Your location";
        const to = destInput.value.trim();
        if (!to) return;

        // Persist route
        sessionStorage.setItem("tn_one_from", from);
        sessionStorage.setItem("tn_one_to", to);

        // Update Panel Header
        panelRouteTitle.textContent = `${from} → ${to}`;
        panelDistanceBadge.textContent = "Calculating...";
        panelAddBusBtn.href = `report.html?from=${encodeURIComponent(from !== "Your location" ? from : "")}&to=${encodeURIComponent(to)}`;

        // Open Bottom Bus Panel (visible)
        busPanel.classList.add("visible");
        togglePanel(true); // Open expanded to show buses immediately

        // 1. Fetch Buses
        loadBusesForRoute(from, to);

        // 2. Geocode & Draw Route with distance
        calculateAndDrawRoute(from, to);
      }

      // API: Load Buses & Sort Timings
      async function loadBusesForRoute(from, to) {
        panelBusList.innerHTML = `
          <div class="panel-loading">
            <div class="loading-spinner"></div>
            <p style="font-size:13px; color:var(--color-text-secondary); margin-top:6px;">Finding buses for this route...</p>
          </div>`;
        panelBusCount.textContent = "Searching...";

        try {
          const res = await TNOne.get("/api/search", {
            from: from !== "Your location" ? from : "",
            to: to
          });
          const results = res.data && res.data.results ? res.data.results : [];
          renderPanelBuses(results, from, to);
        } catch (err) {
          panelBusList.innerHTML = `
            <div class="panel-empty-state">
              <div style="font-size:24px; margin-bottom:4px;">⚠️</div>
              <p style="color:var(--color-error);">Could not load buses. Please try again.</p>
            </div>`;
          panelBusCount.textContent = "0 found";
        }
      }

      function renderPanelBuses(results, from, to) {
        if (!results || results.length === 0) {
          panelBusCount.textContent = "0 found";
          panelBusList.innerHTML = `
            <div class="panel-empty-state">
              <div style="font-size:28px; margin-bottom:4px;">🚌</div>
              <p style="font-weight:700; color:var(--color-text);">No buses found for this route</p>
              <p style="font-size:12px; color:var(--color-text-secondary);">Be the first to add community timings!</p>
            </div>`;
          return;
        }

        panelBusCount.textContent = `${results.length} found`;

        // Parse time string to minutes from midnight (handles AM/PM and 24h)
        function parseTimeToMinutes(str) {
          if (!str) return null;
          const s = String(str).toLowerCase().trim();
          const m = s.match(/(\d{1,2}):(\d{2})/);
          if (!m) return null;
          let h = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          if (s.includes("pm") && h < 12) h += 12;
          if (s.includes("am") && h === 12) h = 0;
          return h * 60 + min;
        }

        // Current user time
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();

        // Calculate next immediate departure for each bus
        const sortedResults = results.map((entry) => {
          const bus = entry.bus || {};
          let timings = (bus.timings && bus.timings.length > 0) ? bus.timings : [];
          if (entry.timing_display && !timings.includes(entry.timing_display)) {
            timings = [entry.timing_display, ...timings];
          }

          let bestTiming = null;
          let minDiff = Infinity;
          let isUpcomingToday = false;

          for (const t of timings) {
            const tm = parseTimeToMinutes(t);
            if (tm === null) continue;
            const diff = tm - nowMins;
            if (diff >= 0 && diff < minDiff) {
              minDiff = diff;
              bestTiming = t;
              isUpcomingToday = true;
            }
          }

          // If no remaining departures today, find the earliest tomorrow morning
          if (!bestTiming && timings.length > 0) {
            let earliest = Infinity;
            for (const t of timings) {
              const tm = parseTimeToMinutes(t);
              if (tm !== null && tm < earliest) {
                earliest = tm;
                bestTiming = t;
              }
            }
            if (bestTiming) {
              minDiff = (1440 - nowMins) + earliest;
              isUpcomingToday = false;
            }
          }

          const rawTime = bestTiming || entry.boarding_time || entry.timing_display || (timings[0] || "");
          const finalMinsUntil = isFinite(minDiff) ? minDiff : (entry.minutes_until_boarding ?? 9999);

          return {
            ...entry,
            nextImmediateTime: rawTime,
            minutesUntil: finalMinsUntil,
            isUpcomingToday
          };
        });

        // Sort buses strictly by immediate departure time (closest first)
        sortedResults.sort((a, b) => a.minutesUntil - b.minutesUntil);

        panelBusesMap.clear();
        sortedResults.forEach(entry => {
          if (entry && entry.bus && entry.bus.id) {
            panelBusesMap.set(Number(entry.bus.id), entry.bus);
          }
        });

        const cardsHtml = sortedResults.map((entry, idx) => {
          const bus = entry.bus || {};
          const busName = escapeHtml(bus.bus_name || "Bus");
          const busNum = bus.bus_number ? `<span class="panel-bus-num">${escapeHtml(bus.bus_number)}</span>` : "";
          const operator = escapeHtml(bus.operator || bus.bus_type || "");

          // Format next bus timing strictly in AM/PM
          const timeDisplay = formatTimeAmPm(entry.nextImmediateTime);

          // Expected arrival time in AM/PM
          const reachingTimeStr = formatTimeAmPm(entry.reaching_time || bus.reaching_time);
          const arrivalHtml = reachingTimeStr ? `<span style="font-size:11px; color:var(--color-text-secondary); font-weight:600;">Arr: ${escapeHtml(reachingTimeStr)}</span>` : "";

          let countdownText = "";
          const mins = Math.round(entry.minutesUntil);
          if (mins <= 2) {
            countdownText = "Departing now";
          } else if (mins < 60) {
            countdownText = `in ${mins} min`;
          } else if (mins < 1440) {
            const hrs = Math.floor(mins / 60);
            const remMins = mins % 60;
            countdownText = `in ${hrs}h ${remMins > 0 ? remMins + 'm' : ''}`;
          } else {
            countdownText = "Tomorrow";
          }

          // Other upcoming timings for this bus in AM/PM
          let subTimingsHtml = "";
          if (bus.timings && bus.timings.length > 1) {
            const ampmList = bus.timings.map(t => formatTimeAmPm(t)).filter(t => t !== timeDisplay);
            if (ampmList.length > 0) {
              subTimingsHtml = `<div style="font-size:11px; color:var(--color-text-secondary); margin-top:3px;">Later: ${escapeHtml(ampmList.slice(0, 4).join(", "))}</div>`;
            }
          }

          // Spots with Timing Timeline
          let spotsTimelineHtml = "";
          const spotsList = entry.spots || entry.stop_timings || (bus.spots || bus.stop_timings);
          if (spotsList && Array.isArray(spotsList) && spotsList.length > 0) {
            const items = spotsList.map((sp, sIdx) => {
              const isStart = sIdx === 0;
              const isDest = sIdx === spotsList.length - 1;
              const typeClass = isStart ? "start" : (isDest ? "dest" : "intermediate");
              const spotName = escapeHtml(sp.stop || "");
              const spotTime = sp.time ? escapeHtml(formatTimeAmPm(sp.time)) : "";
              const arrow = !isDest ? `<span class="spot-arrow-sep">→</span>` : "";
              return `
                <span class="spot-item-badge ${typeClass}">
                  <span class="spot-dot-indicator"></span>
                  <span class="spot-badge-name">${spotName}</span>
                  ${spotTime ? `<span class="spot-badge-time">${spotTime}</span>` : ""}
                </span>
                ${arrow}
              `;
            }).join("");

            spotsTimelineHtml = `
              <div class="spots-route-timeline" style="margin: 6px 0 2px;">
                <div class="timeline-header" style="display:flex; align-items:center; justify-content:space-between;">
                  <span>📍 Spots &amp; Passing Timings</span>
                  <button type="button" class="btn-add-stop-pill btn-open-add-stop" data-bus-id="${bus.id}">
                    ➕ Add Stop
                  </button>
                </div>
                <div class="spots-scroll-wrap">${items}</div>
              </div>`;
          } else {
            spotsTimelineHtml = `
              <div class="spots-route-timeline" style="margin: 6px 0 2px;">
                <div class="timeline-header" style="display:flex; align-items:center; justify-content:space-between;">
                  <span>📍 Route Stops</span>
                  <button type="button" class="btn-add-stop-pill btn-open-add-stop" data-bus-id="${bus.id}">
                    ➕ Add Stop
                  </button>
                </div>
              </div>`;
          }

          const isNearestUpcoming = idx === 0;

          // Next immediate bus highlight card
          if (isNearestUpcoming) {
            return `
              <div class="panel-bus-item nearest-bus">
                <div class="nearest-bus-badge">🟢 NEXT IMMEDIATE BUS</div>
                <div class="panel-bus-row">
                  <div class="panel-bus-left">
                    <span class="panel-bus-title">🚌 ${busName}</span>
                    ${busNum}
                    ${operator ? `<div class="panel-bus-sub">${operator}</div>` : ""}
                    ${subTimingsHtml}
                  </div>
                  <div class="panel-bus-right">
                    <span class="panel-bus-time">${timeDisplay}</span>
                    <span class="panel-bus-countdown" style="font-weight:800; color:var(--color-primary);">${countdownText}</span>
                    ${arrivalHtml}
                  </div>
                </div>
                ${spotsTimelineHtml}
              </div>`;
          }

          // Subsequent immediate buses in chronological sequence
          return `
            <div class="panel-bus-item">
              <div class="panel-bus-row">
                <div class="panel-bus-left">
                  <span class="panel-bus-title">🚌 ${busName}</span>
                  ${busNum}
                  ${operator ? `<div class="panel-bus-sub">${operator}</div>` : ""}
                  ${subTimingsHtml}
                </div>
                <div class="panel-bus-right">
                  <span class="panel-bus-time">${timeDisplay}</span>
                  <span class="panel-bus-countdown">${countdownText}</span>
                  ${arrivalHtml}
                </div>
              </div>
              ${spotsTimelineHtml}
            </div>`;
        }).join("");


        panelBusList.innerHTML = cardsHtml;
      }

      // Geocoding & Route Calculation
      async function calculateAndDrawRoute(from, to) {
        if (routingControl) {
          try { map.removeLayer(routingControl); } catch(_) {}
          routingControl = null;
        }
        if (fallbackRoute) {
          try { map.removeLayer(fallbackRoute); } catch(_) {}
          fallbackRoute = null;
        }
        if (originMarker) {
          try { map.removeLayer(originMarker); } catch(_) {}
          originMarker = null;
        }
        if (destMarker) {
          try { map.removeLayer(destMarker); } catch(_) {}
          destMarker = null;
        }

        const [p1, p2] = await Promise.all([
          geocodeLocation(from),
          geocodeLocation(to)
        ]);

        if (!p1 || !p2) {
          panelDistanceBadge.textContent = "Route found";
          return;
        }

        const latLng1 = L.latLng(p1[0], p1[1]);
        const latLng2 = L.latLng(p2[0], p2[1]);

        // Start & Destination Markers (Google Maps inspired)
        originMarker = L.circleMarker(latLng1, {
          radius: 8,
          fillColor: "#1a73e8",
          color: "#ffffff",
          weight: 3,
          fillOpacity: 1
        }).addTo(map).bindPopup(`<b>Start:</b> ${from}`);

        destMarker = L.circleMarker(latLng2, {
          radius: 8,
          fillColor: "#ea4335",
          color: "#ffffff",
          weight: 3,
          fillOpacity: 1
        }).addTo(map).bindPopup(`<b>Destination:</b> ${to}`);

        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`;
          const res = await fetch(osrmUrl);
          const data = await res.json();

          if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distKm = (route.distance / 1000).toFixed(1);
            panelDistanceBadge.textContent = `${distKm} km`;
            
            const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
            routingControl = L.polyline(coordinates, {
              color: '#1a73e8',
              weight: 6,
              opacity: 0.9
            }).addTo(map);

            map.fitBounds(routingControl.getBounds(), { padding: [80, 80] });
          } else {
            drawFallbackPolyline(latLng1, latLng2, from, to);
          }
        } catch (_) {
          drawFallbackPolyline(latLng1, latLng2, from, to);
        }
      }

      function drawFallbackPolyline(latLng1, latLng2, from, to) {
        if (routingControl) {
          try { map.removeLayer(routingControl); } catch(_) {}
          routingControl = null;
        }
        fallbackRoute = L.polyline([latLng1, latLng2], {
          color: '#1a73e8',
          weight: 6,
          opacity: 0.85,
          dashArray: '8, 6'
        }).addTo(map);

        // Calculate direct distance in KM using Haversine formula
        const distM = map.distance(latLng1, latLng2);
        const distKm = (distM / 1000).toFixed(1);
        panelDistanceBadge.textContent = `${distKm} km`;

        map.fitBounds(fallbackRoute.getBounds(), { padding: [80, 80] });
      }

      async function geocodeLocation(name) {
        if (name === "Your location" && userMarker) {
          const ll = userMarker.getLatLng();
          return [ll.lat, ll.lng];
        }
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name + ", Tamil Nadu, India")}&limit=1`;
          const res = await fetch(url, { headers: { "Accept-Language": "en" } });
          const data = await res.json();
          if (data && data.length) {
            return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
          }
        } catch (_) {}
        return null;
      }

      // Geolocation Locate Button
      locateBtn.addEventListener("click", () => {
        if (!navigator.geolocation) {
          alert("Geolocation is not supported by your browser.");
          return;
        }
        locateBtn.style.opacity = "0.7";
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            locateBtn.style.opacity = "1";
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            map.setView([lat, lng], 14);

            const customIcon = L.icon({
              iconUrl: 'https://static.vecteezy.com/system/resources/thumbnails/055/364/763/small/a-black-silhouette-of-a-man-standing-icon-isolated-free-png.png',
              iconSize: [40, 40], // size of the icon
              iconAnchor: [20, 40], // point of the icon which will correspond to marker's location
              popupAnchor: [0, -40] // point from which the popup should open relative to the iconAnchor
            });

            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.marker([lat, lng], {
              icon: customIcon
            }).addTo(map).bindPopup("Your current location").openPopup();

            originInput.value = "Your location";
            if (destInput.value.trim()) triggerRouteFlow();
          },
          () => {
            locateBtn.style.opacity = "1";
            alert("Could not retrieve your location. Please check location permissions.");
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });

      // Stop Autocomplete
      function setupAutocomplete(inputEl, onSelect) {
        if (!inputEl) return;
        const wrap = document.createElement("div");
        wrap.className = "autocomplete-wrap";
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);

        const list = document.createElement("div");
        list.className = "autocomplete-list";
        wrap.appendChild(list);

        let debounceTimer = null;
        inputEl.addEventListener("input", () => {
          clearTimeout(debounceTimer);
          const q = inputEl.value.trim();
          if (q.length < 2) {
            list.classList.remove("active");
            list.innerHTML = "";
            return;
          }
          debounceTimer = setTimeout(async () => {
            try {
              const res = await TNOne.get("/api/stops/search", { q });
              const stops = res.data || [];
              if (!stops.length) {
                list.classList.remove("active");
                return;
              }
              list.innerHTML = stops
                .map((s) => `<div class="autocomplete-item" data-name="${escapeHtml(s.stop_name)}">${escapeHtml(s.stop_name)}</div>`)
                .join("");
              list.classList.add("active");
            } catch (_) {
              list.classList.remove("active");
            }
          }, 200);
        });

        list.addEventListener("click", (e) => {
          const item = e.target.closest(".autocomplete-item");
          if (!item) return;
          inputEl.value = item.dataset.name;
          list.classList.remove("active");
          if (onSelect) onSelect(item.dataset.name);
        });

        document.addEventListener("click", (e) => {
          if (!wrap.contains(e.target)) list.classList.remove("active");
        });
      }

      // Add Stop Modal wiring
      const addStopModal = document.getElementById("add-stop-modal");
      const modalBusTitle = document.getElementById("modal-bus-title");
      const modalBusSubtitle = document.getElementById("modal-bus-subtitle");
      const closeAddStopModalBtn = document.getElementById("close-add-stop-modal");
      const cancelAddStopBtn = document.getElementById("cancel-add-stop-btn");
      const addStopForm = document.getElementById("add-stop-form");
      const addStopBusId = document.getElementById("add-stop-bus-id");
      const addStopAfterSelect = document.getElementById("add-stop-after-select");
      const addStopNameInput = document.getElementById("add-stop-name-input");
      const addStopTimeInput = document.getElementById("add-stop-time-input");
      const addStopTimeAmpm = document.getElementById("add-stop-time-ampm");
      const addStopAlert = document.getElementById("add-stop-alert");
      const submitAddStopBtn = document.getElementById("submit-add-stop-btn");

      if (addStopNameInput) {
        setupAutocomplete(addStopNameInput);
      }

      if (addStopTimeInput && addStopTimeAmpm) {
        const syncTimeAmpm = () => {
          addStopTimeAmpm.textContent = addStopTimeInput.value ? formatTimeAmPm(addStopTimeInput.value) : "--:-- --";
        };
        addStopTimeInput.addEventListener("input", syncTimeAmpm);
        addStopTimeInput.addEventListener("change", syncTimeAmpm);
      }

      function openAddStopModal(bus) {
        if (!bus) return;
        addStopBusId.value = bus.id;
        modalBusTitle.textContent = `Add Stop to ${bus.bus_name || "Bus"}`;
        modalBusSubtitle.textContent = `Route: ${bus.start_stop || "Start"} → ${bus.destination || "Destination"}`;

        let stops = [];
        if (bus.spots && Array.isArray(bus.spots) && bus.spots.length > 0) {
          stops = bus.spots.map(s => s.stop || s.stop_name || "");
        } else if (bus.stop_timings && Array.isArray(bus.stop_timings) && bus.stop_timings.length > 0) {
          stops = bus.stop_timings.map(s => s.stop || s.stop_name || "");
        } else {
          const intermediate = bus.boarded_stops ? bus.boarded_stops.split(",").map(s => s.trim()).filter(Boolean) : [];
          stops = [bus.start_stop, ...intermediate, bus.destination].filter(Boolean);
        }

        const uniqueStops = [];
        stops.forEach(s => {
          if (s && !uniqueStops.includes(s)) uniqueStops.push(s);
        });

        addStopAfterSelect.innerHTML = "";
        uniqueStops.forEach((stopName, idx) => {
          const opt = document.createElement("option");
          opt.value = stopName;
          if (idx === 0) {
            opt.textContent = `After ${stopName} (Start)`;
          } else if (idx === uniqueStops.length - 1) {
            opt.textContent = `After ${stopName} (Near Destination)`;
          } else {
            opt.textContent = `After ${stopName}`;
          }
          addStopAfterSelect.appendChild(opt);
        });

        addStopNameInput.value = "";
        addStopTimeInput.value = "";
        addStopTimeAmpm.textContent = "--:-- --";
        addStopAlert.style.display = "none";
        addStopAlert.textContent = "";
        submitAddStopBtn.disabled = false;
        submitAddStopBtn.textContent = "Save Stop to Route";

        addStopModal.style.display = "flex";
        setTimeout(() => addStopNameInput.focus(), 50);
      }

      function closeAddStopModal() {
        if (addStopModal) addStopModal.style.display = "none";
      }

      if (closeAddStopModalBtn) closeAddStopModalBtn.addEventListener("click", closeAddStopModal);
      if (cancelAddStopBtn) cancelAddStopBtn.addEventListener("click", closeAddStopModal);
      if (addStopModal) {
        addStopModal.addEventListener("click", (e) => {
          if (e.target === addStopModal) closeAddStopModal();
        });
      }

      // Delegate click on panel bus items for ➕ Add Stop button
      panelBusList.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-open-add-stop");
        if (!btn) return;
        e.preventDefault();

        const auth = await TNAuth.getStatus();
        if (!auth.authenticated) {
          alert("Please log in to add a stop to this bus route.");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
          return;
        }

        const busId = Number(btn.dataset.busId);
        const bus = panelBusesMap.get(busId);
        if (!bus) {
          alert("Bus details not found. Please refresh the page.");
          return;
        }
        openAddStopModal(bus);
      });

      if (addStopForm) {
        addStopForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const busId = addStopBusId.value;
          const afterStop = addStopAfterSelect.value;
          const stopName = addStopNameInput.value.trim();
          const timeVal = addStopTimeInput.value.trim();

          if (!stopName) {
            addStopAlert.className = "alert alert-error";
            addStopAlert.textContent = "Please enter a stop name.";
            addStopAlert.style.display = "block";
            return;
          }

          const formattedTime = timeVal ? formatTimeAmPm(timeVal) : null;

          submitAddStopBtn.disabled = true;
          submitAddStopBtn.textContent = "Saving Stop...";
          addStopAlert.style.display = "none";

          try {
            const payload = {
              stop_name: stopName,
              after_stop: afterStop,
            };
            if (formattedTime) {
              payload.time = formattedTime;
            }

            await TNOne.post(`/api/buses/${busId}/stops`, payload);

            closeAddStopModal();
            showToast(`Stop "${stopName}" added successfully to the route!`);

            // Re-trigger route flow to refresh the bottom sheet buses immediately
            triggerRouteFlow();
          } catch (err) {
            addStopAlert.className = "alert alert-error";
            addStopAlert.textContent = err.message || "Failed to add stop. Please try again.";
            addStopAlert.style.display = "block";
            submitAddStopBtn.disabled = false;
            submitAddStopBtn.textContent = "Save Stop to Route";
          }
        });
      }

      function showToast(message) {
        const existing = document.querySelector(".toast-notification");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.className = "toast-notification";
        toast.innerHTML = `<span>✅</span> <span>${escapeHtml(message)}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
          toast.style.transition = "opacity 0.3s, transform 0.3s";
          toast.style.opacity = "0";
          toast.style.transform = "translate(-50%, 20px)";
          setTimeout(() => toast.remove(), 300);
        }, 3500);
      }

      function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
    });
  