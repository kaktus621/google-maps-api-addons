/**
 * PanoMarker
 * Version 0.0
 *
 * @author kaktus621@gmail.com (Martin Matysiak)
 * @fileoverview A marker that can be placed inside custom StreetView panoramas.
 * Regular markers inside StreetViewPanoramas can only be shown vertically
 * centered and aligned to LatLng coordinates.
 *
 * Custom StreetView panoramas usually do not have any geographical information
 * (e.g. inside views), thus a different method of positioning the marker has to
 * be used. This class takes simple heading and pitch values from the panorama's
 * center in order to move the marker correctly with the user's viewport
 * changes.
 *
 * Since something like that is not supported natively by the Maps API, the
 * marker actually sits on top of the panorama, DOM-wise outside of the
 * actual map but still inside the map container.
 */

/**
 * @license Copyright 2014 Martin Matysiak.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * PanoMarkerOptions
 *
 * Please note that some parameters are required! If those are not specified,
 * an error will be thrown.
 *
 * {google.maps.StreetViewPanorama} pano Panorama in which to display marker.
 * {google.maps.StreetViewPov} position Marker position.
 * {string} id A unique identifier that will be assigned to the
 *    created div-node.
 * {string} className The class name which will be assigned to the
 *    created div node.
 * {string} icon URL to an image file that shall be used.
 * {string} title Rollover text.
 * {boolean} visible If true, the marker is visible.
 * {google.maps.Size} size The size of the marker in pixels.
 * {google.maps.Point} anchor The point (in pixels) to which objects will snap.
 */



/**
 * Constructor of the marker.
 *
 * @constructor
 * @param {PanoMarkerOptions} opts A set of parameters to customize the marker.
 */
var PanoMarker = function(opts) {
  // In case no options have been given at all, fallback to {} so that the
  // following won't throw errors.
  opts = opts || {};

  /** @private @type {?google.maps.StreetViewPanorama} */
  this.pano_ = opts.pano || null;

  /** @private @type {google.maps.StreetViewPov} */
  this.position_ = opts.position || {heading: 0, pitch: 0};

  /** @private @type {?string} */
  this.id_ = opts.id || null;

  /** @private @type {?string} */
  this.class_ = opts.className || null;

  /** @private @type {?string} */
  this.icon_ = opts.icon || null;

  /** @private @type {?string} */
  this.title_ = opts.title || null;

  /** @private @type {boolean} */
  this.visible_ = opts.visible || true;

  /** @private @type {google.maps.Size} */
  this.size_ = opts.size || new google.maps.Size(32, 32);

  /** @private @type {google.maps.Point} */
  this.anchor_ = opts.anchor || new google.maps.Point(16, 16);

  /** @private @ŧype {?HTMLDivElement} */
  this.marker_ = null;

  /** @priavte @type {Object} */
  this.povListener_ = null;

  // At last, call some methods which use the initialized parameters
  this.create_();
  this.setPano(this.pano_);
};


/**
 * According to the documentation (goo.gl/WT4B57), the field-of-view angle
 * should precisely follow the curve of the form 180/2^zoom. Unfortunately, this
 * is not the case in practice. From experiments, the following FOVs seem to be
 * more correct:
 *
 *        Zoom | best FOV | documented FOV
 *       ------+----------+----------------
 *          0  | 126.5    | 180
 *          1  | 90       | 90
 *          2  | 53       | 45
 *          3  | 28       | 22.5
 *          4  | 14.25    | 11.25
 *          5  | 7.25     | not specified
 *
 * Because of this, we are doing a linear interpolation for zoom values <= 2 and
 * then switch over to an inverse exponential. In practice, the produced
 * values are good enough to result in stable marker positioning, even for
 * intermediate zoom values.
 *
 * @return {number} The (horizontal) field of view angle for the given zoom.
 */
PanoMarker.getFov = function(zoom) {
  return zoom <= 2 ?
      126.5 - zoom * 36.75 :  // linear descent
      195.93 / Math.pow(1.92, zoom); // parameters determined experimentally
};


/**
 * Given the current POV, this method calculates the Pixel coordinates on the
 * given viewport for the desired POV. All credit for the math this method goes
 * to user3146587 on StackOverflow: http://goo.gl/0GGKi6
 *
 * @param {StreetViewPov} targetPov The point-of-view whose coordinates are
 *     requested.
 * @param {StreetViewPov} currentPov POV of the viewport center.
 * @param {Element} viewport The current viewport containing the panorama.
 * @return {Object} Top and Left offsets for the given viewport that point to
 *     the desired point-of-view.
 */
PanoMarker.povToPixel = function(targetPov, currentPov, viewport) {

    // Gather required variables and convert to radians where necessary
    var width = viewport.offsetWidth;
    var height = viewport.offsetHeight;
    var target = {
      left: width / 2,
      top: height / 2
    };

    var DEG_TO_RAD = Math.PI / 180.0;
    var fov = PanoMarker.getFov(currentPov.zoom) * DEG_TO_RAD;
    var h0 = currentPov.heading * DEG_TO_RAD;
    var p0 = currentPov.pitch * DEG_TO_RAD;
    var h = targetPov.heading * DEG_TO_RAD;
    var p = targetPov.pitch * DEG_TO_RAD;

    // f = focal length = distance of current POV to image plane
    var f = (width / 2) / Math.tan(fov / 2);

    var cos_p = Math.cos(p);
    var sin_p = Math.sin(p);

    var cos_h = Math.cos(h);
    var sin_h = Math.sin(h);

    var x = f * cos_p * sin_h;
    var z = f * sin_p;
    var y = f * cos_p * cos_h;

    var cos_p0 = Math.cos(p0);
    var sin_p0 = Math.sin(p0);

    var cos_h0 = Math.cos(h0);
    var sin_h0 = Math.sin(h0);

    var x0 = f * cos_p0 * sin_h0;
    var z0 = f * sin_p0;
    var y0 = f * cos_p0 * cos_h0;

    var nDotD = x0 * x + y0 * y + z0 * z;
    var nDotC = x0 * x0 + y0 * y0 + z0 * z0;

    // Sanity checks
    if (Math.abs(nDotD) < 1e-6) {
      return null;
    }

    var t = nDotC / nDotD;

    if (t < 0.0) {
      return null;
    }

    var tx = t * x;
    var ty = t * y;
    var tz = t * z;

    var vx = -sin_p0 * sin_h0;
    var vy = -sin_p0 * cos_h0;
    var vz =  cos_p0;

    var ux =  cos_p0 * cos_h0;
    var uy = -cos_p0 * sin_h0;
    var uz = 0;

    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;

    var du = tx * ux + ty * uy + tz * uz;
    var dv = tx * vx + ty * vy + tz * vz;

    target.left += du;
    target.top -= dv;
    return target;
};


PanoMarker.prototype.create_ = function() {
  var marker = document.createElement('div');

  // Basic style attributes for every marker
  marker.style.position = 'relative';
  marker.style.cursor = 'pointer';
  marker.style.width = this.size_.width + 'px';
  marker.style.height = this.size_.height + 'px';
  marker.style.display = this.visible_ ? 'block' : 'none';
  marker.style.zIndex = '2';

  // Set other css attributes based on the given parameters
  if (this.id_) { marker.id = this.id_; }
  if (this.class_) { marker.className = this.class_; }
  if (this.title_) { marker.title = this.title_; }
  if (this.icon_) { marker.style.backgroundImage = 'url(' + this.icon_ + ')'; }

  // If neither icon, class nor id is specified, assign the basic google maps
  // marker image to the marker (otherwise it will be invisble)
  if (!(this.id_ || this.class_ || this.icon_)) {
    marker.style.backgroundImage = 'url(https://www.google.com/intl/en_us/' +
        'mapfiles/ms/micons/red-dot.png)';
  }

  this.marker_ = marker;

  // Attach to some global events
  window.addEventListener('resize', this.draw.bind(this));
};


/** @override */
PanoMarker.prototype.draw = function() {
  if (!this.pano_) {
    return;
  }

  // Calculate the position according to the viewport etc etc
  var offset = PanoMarker.povToPixel(this.position_,
      this.pano_.getPov(),
      this.pano_.getContainer());

  if( offset !== null ){
    this.marker_.style.left = (offset.left - this.anchor_.x) + 'px';
    this.marker_.style.top = (offset.top - this.anchor_.y) + 'px';
  }
};


/**
 * Getter for .position_
 * @return {google.maps.LatLng} An object representing the current position.
 */
PanoMarker.prototype.getPosition = function() { return this.position_; };


/**
 * Method for repositioning the marker. The change will be drawn immediatly
 *
 * @param {google.maps.LatLng} position A google.maps.LatLng object with
 * the desired position.
 */
PanoMarker.prototype.setPosition = function(position) {
  this.position_ = position;
  this.draw();
};


/**
 * Method for obtaining the Identifier of the marker
 *
 * @return {string} The identifier or null if not set upon marker creation.
*/
PanoMarker.prototype.getId = function() {
  return this.id_;
};


/**
 * Getter for .title_
 * @return {string} If set, the marker's rollover text, otherwise an empty
 *    string.
 */
PanoMarker.prototype.getTitle = function() {
  return this.title_ || '';
};


/**
 * Setter for .title_
 * @param {string} title the new rollover text.
 */
PanoMarker.prototype.setTitle = function(title) {
  this.title_ = title;
  this.marker_.title = title;
};


/**
 * Getter for .visible_
 * @return {boolean} true if the marker is set to being visible, else false.
 */
PanoMarker.prototype.getVisible = function() {
  return this.visible_;
};


/**
 * Setter for .visible_
 * @param {boolean} show true if marker shall be shown, else false.
 */
PanoMarker.prototype.setVisible = function(show) {
  this.visible_ = show;
  this.marker_.style.display = show ? 'block' : 'none';
};


/**
 * Getter for .pano_
 * @return {google.maps.StreetViewPanorama} The panorama.
 */
PanoMarker.prototype.getPano = function() { return this.pano_; };


/**
 * Setter for .pano_. Adds the marker to the requested panorama.
 * @param {google.maps.StreetViewPanorama} pano The new panorama, or null if the
 *    marker shall be removed.
 */
PanoMarker.prototype.setPano = function(pano) {
  if (pano == null) {
    this.marker_.parentNode.removeChild(this.marker_);
  } else {
    // Unbind from old panorama, if any
    if (this.povListener_ !== null) {
      google.maps.event.removeListener(this.povListener_);
    }

    pano.getContainer().appendChild(this.marker_);
    this.povListener_ =
      google.maps.event.addListener(pano, 'pov_changed', this.draw.bind(this));
  }

  this.pano_ = pano;
  this.draw();
};
