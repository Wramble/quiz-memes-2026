/**
 * Preloads the presentation's audio and video elements before revealing the content.
 *
 * @param {object} options
 * @param {Document} options.document Document containing the presentation
 * @param {typeof XMLHttpRequest} options.xhr XMLHttpRequest implementation
 * @param {function} options.createObjectURL Function that creates a URL for a blob
 * @returns {Promise<void>} Resolves when every media request has finished
 */
export const initMediaLoader = ({
document: documentRef = document,
xhr: XMLHttpRequestClass = XMLHttpRequest,
createObjectURL = URL.createObjectURL.bind( URL )
} = {}) => {

const loader = documentRef.querySelector( '#media-loader' );
const mediaElements = Array.from( documentRef.querySelectorAll( 'audio, video' ) );

const revealContent = () => {

documentRef.body.classList.remove( 'media-loading' );
loader?.remove();

};

if( mediaElements.length === 0 ) {
revealContent();
return Promise.resolve();
}

const requests = mediaElements.map( element => new Promise( resolve => {

const timestamp = element.src.split( '#t=' )[1] ?? 0;
const request = new XMLHttpRequestClass();
let settled = false;

const finishRequest = () => {

if( settled ) return;

settled = true;
resolve();

};

request.open( 'GET', element.src );
request.responseType = 'blob';

request.onload = () => {

if( request.response ) {
element.src = createObjectURL( request.response ) + '#t=' + timestamp;
}

};

request.onloadend = finishRequest;
request.onerror = finishRequest;
request.onabort = finishRequest;
request.ontimeout = finishRequest;
request.send();

} ) );

return Promise.all( requests ).then( revealContent );

};
