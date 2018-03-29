import Media from '../media';
import { addEvent } from '../utils/events';
import { loadScript } from '../utils/general';
import { isAutoplaySupported } from '../utils/media';

declare const google: any;
/**
 * Ads
 *
 * @description This class implements Google IMA SDK v3.0 to display VAST and VPAID advertisement
 * @see https://developers.google.com/interactive-media-ads/
 * @class Ads
 */
class Ads {
    public adsEnded: boolean;
    public adsDone: boolean;
    public adsActive: boolean;
    public adsStarted: boolean;
    public intervalTimer: number;
    public adsVolume: number;
    public adsMuted: boolean;
    public adsDuration: number;
    public adsCurrentTime: number;
    public adsManager: any;
    private media: Media;
    private element: HTMLMediaElement;
    private events: any[];
    private adsUrl: string;
    private promise: Promise<any>;
    private adsLoader: any;
    private adsContainer: HTMLDivElement;
    private adsCompany: HTMLDivElement;
    private adDisplayContainer: any;
    private adsRequest: any;
    private autoplayAllowed: boolean;
    private autoplayRequiresMuted: boolean;

    /**
     * Creates an media of Google IMA SDK.
     *
     * @param {Media} media
     * @param {object} file
     * @returns {Ads}
     * @memberof Ads
     */
    constructor(media: Media, adsUrl: string) {
        this.adsUrl = adsUrl;
        this.media = media;
        this.element = media.element;
        this.adsManager = null;
        this.events = null;
        this.adsEnded = false;
        this.adsDone = false;
        this.adsActive = false;
        this.adsStarted = false;
        this.intervalTimer = 0;
        this.adsVolume = this.element.volume;
        this.adsMuted = false;
        this.adsDuration = 0;
        this.adsCurrentTime = 0;
        this.autoplayAllowed = false;
        this.autoplayRequiresMuted = false;

        // Test browser capabilities to autoplay add
        isAutoplaySupported(autoplay => {
            this.autoplayAllowed = autoplay;
        }, muted => {
            this.autoplayRequiresMuted = muted;
        }, () => {
            if (this.autoplayRequiresMuted) {
                this.media.muted = true;
                this.media.volume = 0;

                const e = addEvent('volumechange');
                this.element.dispatchEvent(e);
            }
            this.promise = (typeof google === 'undefined' || typeof google.ima === 'undefined') ?
                loadScript('https://imasdk.googleapis.com/js/sdkloader/ima3.js') :
                new Promise(resolve => {
                    resolve();
                });

            this.promise.then(this.load.bind(this));
        });

        return this;
    }

    /**
     * Create the Ads container and loader to process the Ads URL provided.
     *
     * @memberof Ads
     */
    public load() {
        this.adsContainer = document.createElement('div');
        this.adsContainer.id = 'om-ads';
        this.adsContainer.tabIndex = -1;
        this.element.parentElement.insertBefore(this.adsContainer, this.element.nextSibling);

        // Create responsive ad
        window.addEventListener('resize', this.resizeAds.bind(this));

        this._setup();
        this._requestAds();
    }

    public play() {
        if (!this.adsDone) {
            this.adDisplayContainer.initialize();
            this._playAds();
            this.adsDone = true;
        } else if (this.adsManager) {
            this.adsActive = true;
            this.adsManager.resume();
            const e = addEvent('play');
            this.element.dispatchEvent(e);
        }
    }

    public pause() {
        if (this.adsManager) {
            this.adsActive = false;
            this.adsManager.pause();
            const e = addEvent('pause');
            this.element.dispatchEvent(e);
        }
    }

    public destroy() {
        this.events.forEach(event => {
            this.adsManager.removeEventListener(event, this._assign.bind(this));
        });

        this.events = [];

        this.adsLoader.removeEventListener(
            google.ima.AdErrorEvent.Type.AD_ERROR,
            this._error.bind(this),
        );
        this.adsLoader.removeEventListener(
            google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            this._loaded.bind(this),
        );

        if (this.adsManager) {
            this.adsManager.destroy();
        }

        this.element.removeEventListener('ended', this._contentEndedListener.bind(this));
        window.removeEventListener('resize', this.resizeAds.bind(this));
        this.adsContainer.remove();
    }

    public resizeAds(width?: number, height?: number) {
        if (this.adsManager) {
            const target = this.element.parentElement;
            if (width && height) {
                const mode = target.getAttribute('data-fullscreen') === 'true' ?
                    google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;
                this.adsManager.resize(
                    width,
                    height,
                    mode,
                );
            } else {
                this.adsManager.resize(
                    target.offsetWidth,
                    target.offsetHeight,
                    google.ima.ViewMode.NORMAL,
                );
            }
        }
    }

    set volume(value) {
        this.adsVolume = value;
        this.adsManager.setVolume(value);
        this.media.volume = value;
        this.media.muted = (value === 0);
        this.adsMuted = (value === 0);
    }

    get volume() {
        return this.adsVolume;
    }

    set muted(value) {
        if (value === true) {
            this.adsManager.setVolume(0);
            this.adsMuted = true;
            this.media.muted = true;
            this.media.volume = 0;
        } else {
            this.adsManager.setVolume(this.adsVolume);
            this.adsMuted = false;
            this.media.muted = false;
            this.media.volume = this.adsVolume;
        }
    }

    get muted() {
        return this.adsMuted;
    }

    set currentTime(value: number) {
        this.adsCurrentTime = value;
    }
    get currentTime() {
        return this.adsCurrentTime;
    }

    get duration() {
        return this.adsDuration;
    }

    get paused() {
        return !this.adsActive;
    }

    get ended() {
        return this.adsEnded;
    }

    private _assign(event: any) {
        const ad = event.getAd();
        switch (event.type) {
            case google.ima.AdEvent.Type.LOADED:
                if (!ad.isLinear()) {
                    this._onContentResumeRequested();
                } else {
                    if (!this.media.paused) {
                        this.media.pause();
                    }
                    this.element.parentElement.classList.add('om-ads--active');
                    this.adsDuration = ad.getDuration();
                    this.adsCurrentTime = ad.getDuration();
                    const loadedEvent = addEvent('loadedmetadata');
                    this.element.dispatchEvent(loadedEvent);
                }
                break;
            case google.ima.AdEvent.Type.STARTED:
                if (ad.isLinear()) {
                    this.adsActive = true;
                    if (this.media.ended) {
                        this.adsEnded = false;
                        const e = addEvent('ads.ended');
                        this.element.dispatchEvent(e);
                    }
                    this.intervalTimer = window.setInterval(() => {
                        this.adsCurrentTime = this.adsManager.getRemainingTime();
                        const e = addEvent('timeupdate');
                        this.element.dispatchEvent(e);

                        const playing = addEvent('playing');
                        this.element.dispatchEvent(playing);
                    }, 50);
                }
                break;
            case google.ima.AdEvent.Type.COMPLETE:
            case google.ima.AdEvent.Type.SKIPPED:
                this.element.parentElement.classList.remove('om-ads--active');
                this.adsActive = false;
                if (ad.isLinear()) {
                    clearInterval(this.intervalTimer);
                }
                break;
            case google.ima.AdEvent.Type.VOLUME_CHANGED:
            case google.ima.AdEvent.Type.VOLUME_MUTED:
                if (ad.isLinear()) {
                    const e = addEvent('volumechange');
                    this.element.dispatchEvent(e);
                }
                break;
            case google.ima.AdEvent.ALL_ADS_COMPLETED:
                this.adsActive = false;
                this.adsEnded = true;
                this.element.parentElement.classList.remove('om-ads--active');
                break;
        }
    }

    private _error(event: any) {
        console.error(`Ad error: ${event.getError().toString()}`);
        if (this.adsManager) {
            this.adsManager.destroy();
        }
        this._resumeMedia();
    }

    private _loaded(adsManagerLoadedEvent: any) {
        const adsRenderingSettings = new google.ima.AdsRenderingSettings();
        adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;
        // Get the ads manager.
        this.adsManager = adsManagerLoadedEvent.getAdsManager(this.element, adsRenderingSettings);
        this._start(this.adsManager);
    }

    private _start(manager: any) {
        // Add listeners to the required events.
        manager.addEventListener(
            google.ima.AdErrorEvent.Type.AD_ERROR,
            this._error.bind(this));
        manager.addEventListener(
            google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
            this._onContentPauseRequested.bind(this));
        manager.addEventListener(
            google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
            this._onContentResumeRequested.bind(this));

        this.events = [
            google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
            google.ima.AdEvent.Type.CLICK,
            google.ima.AdEvent.Type.COMPLETE,
            google.ima.AdEvent.Type.FIRST_QUARTILE,
            google.ima.AdEvent.Type.LOADED,
            google.ima.AdEvent.Type.MIDPOINT,
            google.ima.AdEvent.Type.PAUSED,
            google.ima.AdEvent.Type.STARTED,
            google.ima.AdEvent.Type.THIRD_QUARTILE,
            google.ima.AdEvent.Type.SKIPPED,
            google.ima.AdEvent.Type.VOLUME_CHANGED,
            google.ima.AdEvent.Type.VOLUME_MUTED,
        ];

        this.events.forEach(event => {
            manager.addEventListener(event, this._assign.bind(this));
        });

        if (this.autoplayAllowed) {
            this._playAds();
        }
    }

    private _contentEndedListener() {
        this.adsEnded = true;
        this.adsActive = false;
        this.adsStarted = false;
        this.adsLoader.contentComplete();
    }

    private _onContentPauseRequested() {
        this.element.removeEventListener('ended', this._contentEndedListener.bind(this));
        if (this.adsStarted) {
            this.media.pause();
        } else {
            this.adsStarted = true;
        }
        const e = addEvent('play');
        this.element.dispatchEvent(e);
    }

    private _onContentResumeRequested() {
        this.element.addEventListener('ended', this._contentEndedListener.bind(this));
        this._resumeMedia();
    }

    private _resumeMedia() {
        this.intervalTimer = 0;
        this.adsMuted = false;
        this.adsStarted = false;
        this.adsDuration = 0;
        this.adsCurrentTime = 0;
        this.element.parentElement.classList.remove('om-ads--active');

        if (this.autoplayAllowed && !this.media.ended) {
            setTimeout(() => {
                this.media.play();
                const event = addEvent('play');
                this.element.dispatchEvent(event);
            }, 500);
        } else {
            const event = addEvent('ended');
            this.element.dispatchEvent(event);
        }
    }

    private _requestAds() {
        if (this.adsLoader) {
            this.adsLoader.contentComplete();
        }
        this.adsRequest = new google.ima.AdsRequest();
        this.adsRequest.adTagUrl = this.adsUrl;

        const width = this.element.parentElement.offsetWidth;
        const height = this.element.parentElement.offsetWidth;
        this.adsRequest.linearAdSlotWidth = width;
        this.adsRequest.linearAdSlotHeight = height;
        this.adsRequest.nonLinearAdSlotWidth = width;
        this.adsRequest.nonLinearAdSlotHeight = 150;

        this.adsRequest.setAdWillAutoPlay(this.autoplayAllowed);
        this.adsRequest.setAdWillPlayMuted(this.autoplayRequiresMuted);
        this.adsLoader.requestAds(this.adsRequest);
    }

    private _setup() {
        google.ima.settings.setVpaidMode(google.ima.ImaSdkSettings.VpaidMode.ENABLED);
        this.adDisplayContainer =
            new google.ima.AdDisplayContainer(
                this.adsContainer,
                this.element,
                this.adsCompany,
            );

        this.adsLoader = new google.ima.AdsLoader(this.adDisplayContainer);
        this.adsLoader.getSettings().setDisableCustomPlaybackForIOS10Plus(true);
        this.adsLoader.addEventListener(
            google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            this._loaded.bind(this),
        );
        this.adsLoader.addEventListener(
            google.ima.AdErrorEvent.Type.AD_ERROR,
            this._error.bind(this),
        );

        this.element.addEventListener('ended', this._contentEndedListener.bind(this));
    }

    private _playAds() {
        try {
            if (!this.adsDone) {
                this.adDisplayContainer.initialize();
                this.adsDone = true;
            }
            // Initialize the ads manager. Ad rules playlist will start at this time.
            this.adsManager.init(
                this.element.offsetWidth,
                this.element.offsetHeight,
                google.ima.ViewMode.NORMAL,
            );
            this.adsManager.start();
            const e = addEvent('play');
            this.element.dispatchEvent(e);
            this.adsActive = true;
            this.adsStarted = true;
        } catch (adError) {
            this._resumeMedia();
        }
    }
}

export default Ads;
