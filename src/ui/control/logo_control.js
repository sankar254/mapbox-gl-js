'use strict';

const DOM = require('../../util/dom');
const util = require('../../util/util');

/**
 * A `LogoControl` is a control that adds the Mapbox watermark
 * to the map as required by the [terms of service](https://www.mapbox.com/tos/) for Mapbox
 * vector tiles and core styles.
 *
 * @implements {IControl}
 * @private
**/

class LogoControl {

    constructor() {
        util.bindAll(['_updateLogo'], this);
    }

    onAdd(map) {
        this._map = map;
        this._container = DOM.create('div', 'mapboxgl-ctrl');
        const anchor = DOM.create('a', 'mapboxgl-ctrl-logo');
        anchor.target = "_blank";
        anchor.href = "https://www.mapbox.com/";
        anchor.setAttribute("aria-label", "Mapbox logo");
        this._container.appendChild(anchor);
        this._container.style.display = 'none';


        this._logoDisplay = false;
        this._map.on('sourcedata', this._updateLogo);
        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map.off('sourcedata', this._updateLogo);
    }

    getDefaultPosition() {
        return 'bottom-left';
    }

    _updateLogo(e) {
        if (e && e.sourceDataType === 'metadata') {
            if (!this._logoDisplay && this._logoRequired()) {
                this._container.style.display = 'block';
                this._logoDisplay = true;
            } else if (this._logoDisplay && !this._logoRequired()) {
                this._container.style.display = 'none';
                this._logoDisplay = false;
            }
        }
    }

    _logoRequired() {
        if (!this._map.style) return;

        const sourceCaches = this._map.style.sourceCaches;
        for (const id in sourceCaches) {
            const source = sourceCaches[id].getSource();
            if (source.mapbox_logo) {
                return true;
            }
        }

        return false;
    }

}


module.exports = LogoControl;
