(function () {
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createCityPopupHTML(city, photos) {
    var photoItems = photos.slice(0, 3).map(function (photo) {
      return '<div class="city-popup-photo"><img src="' + photo.image.replace(/^\//, '') + '" alt="' + escapeHtml(photo.title) + '" loading="lazy"></div>';
    }).join('');

    if (photos.length < 3) {
      for (var i = photos.length; i < 3; i += 1) {
        photoItems += '<div class="city-popup-photo placeholder-box" aria-hidden="true"></div>';
      }
    }

    return (
      '<div class="city-popup-card">' +
        '<div class="city-popup-header">' +
          '<div>' +
            '<h3 class="display city-popup-title">' + escapeHtml(city.name) + '</h3>' +
            '<p class="city-popup-meta">' + escapeHtml(city.regionName) + ' · ' + escapeHtml(city.country) + '</p>' +
          '</div>' +
          '<button type="button" class="city-popup-close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="city-popup-strip">' + photoItems + '</div>' +
        '<a href="' + city.slug + '.html" class="city-popup-link">View Gallery →</a>' +
      '</div>'
    );
  }

  function initHomeHeader() {
    if (document.body.dataset.page !== 'home') return;
    var header = qs('#site-header');
    if (!header) return;

    function updateHeader() {
      if (window.scrollY > 80) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    }

    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  function buildAdjustedCities(locations) {
    var flat = [];
    locations.forEach(function (location) {
      location.cities.forEach(function (city) {
        flat.push({ location: location, city: city, adjusted: city.coordinates.slice() });
      });
    });

    var used = new Array(flat.length).fill(false);
    var clusters = [];

    function distance(a, b) {
      var latDiff = a[0] - b[0];
      var lngScale = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
      var lngDiff = (a[1] - b[1]) * lngScale;
      return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    }

    for (var i = 0; i < flat.length; i += 1) {
      if (used[i]) continue;
      var cluster = [flat[i]];
      used[i] = true;
      for (var j = i + 1; j < flat.length; j += 1) {
        if (used[j]) continue;
        if (distance(flat[i].city.coordinates, flat[j].city.coordinates) < 3.6) {
          cluster.push(flat[j]);
          used[j] = true;
        }
      }
      clusters.push(cluster);
    }

    var offsetsByCount = {
      2: [[0, -0.7], [0, 0.7]],
      3: [[0.55, -0.7], [-0.55, -0.7], [0, 0.85]],
      4: [[0.55, -0.7], [-0.55, -0.7], [0.55, 0.7], [-0.55, 0.7]]
    };

    clusters.forEach(function (cluster) {
      if (cluster.length < 2) return;
      var offsets = offsetsByCount[cluster.length] || offsetsByCount[4];
      cluster.forEach(function (entry, index) {
        var offset = offsets[index] || [0, 0];
        entry.adjusted = [entry.city.coordinates[0] + offset[0], entry.city.coordinates[1] + offset[1]];
      });
    });

    return flat;
  }

  function initMap() {
    if (document.body.dataset.page !== 'home') return;
    if (!window.L || !window.siteData) return;

    var mapEl = qs('#map');
    var popupAnchor = qs('#city-popup-anchor');
    if (!mapEl || !popupAnchor) return;

    var map = L.map('map', {
      center: [30, 20],
      zoom: 2,
      scrollWheelZoom: false,
      worldCopyJump: true
    });

    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    var pinIcon = L.divIcon({
      className: '',
      html: '<span class="map-pin"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10]
    });

    var activePopup = null;

    function closePopup() {
      var trigger = activePopup && activePopup.trigger;
      activePopup = null;
      popupAnchor.innerHTML = '';
      popupAnchor.classList.add('hidden');
      if (trigger && document.body.contains(trigger)) {
        trigger.focus();
      }
    }

    function positionPopup(latlng) {
      if (!latlng || !qs('.city-popup-card', popupAnchor)) return;

      var point = map.latLngToContainerPoint(latlng);
      var card = qs('.city-popup-card', popupAnchor);
      var padding = 16;
      var gap = 18;
      var mapWidth = mapEl.clientWidth;
      var mapHeight = mapEl.clientHeight;
      var cardWidth = card.offsetWidth;
      var cardHeight = card.offsetHeight;
      var left = point.x + gap;
      var top = point.y - (cardHeight / 2);

      if (left + cardWidth > mapWidth - padding) {
        left = point.x - gap - cardWidth;
      }

      if (left < padding) {
        left = Math.max(padding, Math.min(point.x + gap, mapWidth - cardWidth - padding));
      }

      if (top < padding) {
        top = padding;
      }

      if (top + cardHeight > mapHeight - padding) {
        top = mapHeight - cardHeight - padding;
      }

      popupAnchor.style.left = left + 'px';
      popupAnchor.style.top = (mapEl.offsetTop + top) + 'px';
    }

    function openPopup(city, latlng, triggerElement) {
      var photos = window.siteData.photos.filter(function (photo) {
        return photo.city === city.slug;
      }).slice(0, 3);

      popupAnchor.innerHTML = createCityPopupHTML(city, photos);
      popupAnchor.classList.remove('hidden');
      activePopup = { city: city, latlng: latlng, trigger: triggerElement || null };
      positionPopup(latlng);

      var closeButton = qs('.city-popup-close', popupAnchor);
      var popupLink = qs('.city-popup-link', popupAnchor);
      if (closeButton) {
        closeButton.addEventListener('click', closePopup);
        closeButton.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closePopup();
          }
        });
        closeButton.focus();
      } else if (popupLink) {
        popupLink.focus();
      }
    }

    buildAdjustedCities(window.siteData.locations).forEach(function (entry) {
      var markerLatLng = entry.adjusted.slice();
      var marker = L.marker(markerLatLng, {
        icon: pinIcon,
        keyboard: true,
        title: entry.city.name
      }).addTo(map);

      function openMarkerPopup() {
        openPopup({
          name: entry.city.name,
          slug: entry.city.slug,
          regionName: entry.location.region,
          country: entry.location.country
        }, marker.getLatLng(), marker.getElement());
      }

      marker.on('click', openMarkerPopup);

      var markerElement = marker.getElement();
      if (markerElement) {
        markerElement.setAttribute('tabindex', '0');
        markerElement.setAttribute('role', 'button');
        markerElement.setAttribute('aria-label', 'Open ' + entry.city.name + ' location preview');
        markerElement.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMarkerPopup();
          }
        });
      }
    });

    map.on('zoom move resize', function () {
      if (activePopup) {
        positionPopup(activePopup.latlng);
      }
    });
  }

  function initGalleryCarousels() {
    qsa('[data-gallery-carousel]').forEach(function (carousel) {
      var viewport = qs('.gallery-city-viewport', carousel);
      var track = qs('.gallery-city-track', carousel);
      var slides = qsa('.gallery-slide', carousel);
      var prev = qs('.carousel-arrow-left', carousel);
      var next = qs('.carousel-arrow-right', carousel);
      var progress = qs('.progress-line span', carousel.parentElement);
      var currentIndex = 0;
      var trackIndex = 0;
      var visibleCount = 0;
      var isMoving = false;
      var gap = 12;

      if (!viewport || !track || slides.length === 0) return;

      var items = slides.map(function (slide) {
        var img = qs('img', slide);
        return {
          href: slide.getAttribute('href') || '#',
          src: img ? img.getAttribute('src') : '',
          alt: img ? img.getAttribute('alt') : ''
        };
      });

      function getVisibleCount() {
        if (window.innerWidth <= 640) return 1;
        if (window.innerWidth <= 900) return 2;
        return 3;
      }

      function getLogicalIndex() {
        return ((currentIndex % items.length) + items.length) % items.length;
      }

      function updateProgress() {
        if (!progress) return;
        var logicalIndex = getLogicalIndex();
        progress.style.width = (100 / items.length) + '%';
        progress.style.left = ((100 / items.length) * logicalIndex) + '%';
      }

      function setSlideSizes() {
        var width = 'calc((100% - ' + ((visibleCount - 1) * gap) + 'px) / ' + visibleCount + ')';
        qsa('.gallery-slide', track).forEach(function (slide) {
          slide.style.flexBasis = width;
        });
      }

      function moveToTrackIndex(animate) {
        var target = track.children[trackIndex];
        if (!target) return;

        track.style.transition = animate ? 'transform 0.42s ease' : 'none';
        track.style.transform = 'translateX(-' + target.offsetLeft + 'px)';

        if (!animate) {
          track.offsetHeight;
          track.style.transition = 'transform 0.42s ease';
        }
      }

      function buildTrack() {
        visibleCount = Math.min(getVisibleCount(), items.length);
        track.style.setProperty('--visible-count', visibleCount);

        var before = items.slice(-visibleCount);
        var after = items.slice(0, visibleCount);
        var renderedItems = before.concat(items).concat(after);

        track.innerHTML = renderedItems.map(function (item) {
          return '<a href="' + item.href + '" class="gallery-city-photo gallery-slide">' +
            '<img src="' + item.src + '" alt="' + escapeHtml(item.alt) + '" loading="lazy">' +
          '</a>';
        }).join('');

        setSlideSizes();
        trackIndex = visibleCount + getLogicalIndex();
        moveToTrackIndex(false);
        updateProgress();
      }

      function move(direction) {
        if (isMoving || items.length <= 1) return;
        isMoving = true;
        currentIndex += direction;
        trackIndex += direction;
        moveToTrackIndex(true);
        updateProgress();
      }

      if (prev) {
        prev.addEventListener('click', function () {
          move(-1);
        });
      }

      if (next) {
        next.addEventListener('click', function () {
          move(1);
        });
      }

      track.addEventListener('transitionend', function (event) {
        if (event.propertyName !== 'transform') return;

        if (currentIndex >= items.length) {
          currentIndex = 0;
          trackIndex = visibleCount;
          moveToTrackIndex(false);
        } else if (currentIndex < 0) {
          currentIndex = items.length - 1;
          trackIndex = visibleCount + currentIndex;
          moveToTrackIndex(false);
        }

        updateProgress();
        isMoving = false;
      });

      window.addEventListener('resize', function () {
        currentIndex = getLogicalIndex();
        buildTrack();
      });

      buildTrack();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHomeHeader();
    initMap();
    initGalleryCarousels();
  });
})();
