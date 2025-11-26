import { Scribby } from "./components/Scribby.js";
import { RangeMarker } from "./custom_elements/Marker.js";

(() => {
    customElements.define("range-marker", RangeMarker);

    let scribby = new Scribby('#scribby-editor').mount();
    let scribby2 = new Scribby('#scribby-editor2').mount();
    console.log(scribby)
    console.log("scribby!")
})();