import {goToPage} from "../../../utils.js"
import {translate} from "../translationUtils.js";
import environment from "../../../environment.js";
import constants from "../../../constants.js";
import Scanner from "./../../lib/zxing-wrapper/scanner.js";
  
function MainController() {

    this.loadGifControl = function () {
        const image = document.querySelector('#pack-gif');
        const imageAlt = image.getAttribute('alt');
        const controlGifButton = document.querySelector('#control-gif');
        const animatedGif = new SuperGif({gif: image, show_progress_bar: false, draw_while_loading: false});
        
        animatedGif.load();

        const gifContainer = document.querySelector('.jsgif');
        gifContainer.setAttribute('aria-label', imageAlt);
        function toggleAnimationState() {
            const playing = animatedGif.get_playing();
            controlGifButton.classList.toggle('playing');
            if(playing) {
                animatedGif.pause();
            } else {
                animatedGif.play();
            }
        };

        gifContainer.addEventListener('mouseenter', toggleAnimationState);
        gifContainer.addEventListener('mouseleave', toggleAnimationState);
        controlGifButton.addEventListener('click', toggleAnimationState);
    }

    this.toggleMenu = function () {
        let menuButton = document.getElementById("hamburger-menu-button");
        let menuExpandedAttr = menuButton.getAttribute("aria-expanded") === "true";
        menuButton.setAttribute("aria-expanded", !menuExpandedAttr);
        let menuContainer = document.querySelector(".app-menu-container");
        menuContainer.classList.toggle("hidden");
        if (menuExpandedAttr) {
            document.querySelector(".page-content-section").removeAttribute("inert");
        } else {
            document.querySelector(".page-content-section").setAttribute("inert", "");
        }
    }

    this.checkOnboarding = function () {
        let usrAgreedTerms = JSON.parse(localStorage.getItem(constants.USR_AGREED_TERMS));
        if (!usrAgreedTerms) {
            document.querySelector(".welcome-container #onbording-text").classList.remove("hiddenElement")
            document.querySelector(".content-container").classList.add("hiddenElement");
            document.querySelector(".explain-container").classList.add("hiddenElement");
            document.querySelector(".scan-button-container").classList.add("hiddenElement");
        } else {
            document.querySelector(".terms-content-container").classList.add("hiddenElement");
            document.querySelector(".welcome-container #welcome-text").classList.remove("hiddenElement");
        }
        document.querySelector("#app_version_number").innerHTML = `${environment.appBuildVersion}`;
    }

    this.submitTerms = function (status) {
        if (status) {
            localStorage.setItem(constants.USR_AGREED_TERMS, true);
        }
        location.reload();
    }

    this.scanHandler = async function () {
        goToPage("/scan.html")
    }

    this.showModal = function (key) {
        this.toggleMenu();
        goToPage(`/${key}-page.html`)
    }

    let addEventListeners = () => {
        let menuContainer = document.querySelector(".app-menu-container");
        let menuButton = document.getElementById("hamburger-menu-button");
        const focusableElements = [...document.querySelectorAll('.app-menu-container li')];
        let firstFocusableEl = focusableElements[0];
        let lastFocusableEl = focusableElements[focusableElements.length - 1];
        let KEYCODE_TAB = 9;

        this.loadGifControl();
       
        menuButton.addEventListener("keydown", (event) => {
            switch (event.key) {
                case ' ':
                case 'Enter':
                case 'ArrowDown':
                case 'Down':
                    this.toggleMenu();
                    firstFocusableEl.focus();
                    event.stopPropagation();
                    event.preventDefault();
                    break;

                case 'Up':
                case 'ArrowUp':
                    this.toggleMenu();
                    lastFocusableEl.focus();
                    event.stopPropagation();
                    event.preventDefault();
                    break;
                default:
                    break;
            }
        })
        // Add event listener to the menu to capture the Tab key press and trap focus in menu


        menuContainer.addEventListener('keydown', function (e) {
            let activeIndex = focusableElements.findIndex((item) => document.activeElement === item);
            if (activeIndex < 0) {
                activeIndex = 0;
            }
            switch (e.key) {
                case 'Up':
                case 'ArrowUp':
                    e.stopPropagation();
                    e.preventDefault();

                    if (activeIndex === 0) {
                        lastFocusableEl.focus();
                    } else {
                        focusableElements[activeIndex - 1].focus();
                    }

                    break;

                case 'ArrowDown':
                case 'Down':
                    e.stopPropagation();
                    e.preventDefault();
                    if (activeIndex === focusableElements.length - 1) {
                        firstFocusableEl.focus();
                    } else {
                        focusableElements[activeIndex + 1].focus();
                    }
                    break;
                case 'Home':
                case 'PageUp':
                    e.stopPropagation();
                    e.preventDefault();
                    firstFocusableEl.focus();
                    break;

                case 'End':
                case 'PageDown':
                    e.stopPropagation();
                    e.preventDefault();
                    lastFocusableEl.focus();
                    break;
            }

            let isTabPressed = (e.key === 'Tab' || e.keyCode === KEYCODE_TAB);
            if (!isTabPressed) {
                return;
            }

            if (e.shiftKey) /* shift + tab */ {
                if (document.activeElement === firstFocusableEl) {
                    lastFocusableEl.focus();
                    e.preventDefault();
                }
            } else /* tab */ {
                if (document.activeElement === lastFocusableEl) {
                    firstFocusableEl.focus();
                    e.preventDefault();
                }
            }
        });


        let liElements = menuContainer.querySelectorAll('li.forward-to-page');

        liElements.forEach(function (li) {
            li.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    li.click();
                }
            });
        });

        document.getElementById("hamburger-menu-button").addEventListener("click", this.toggleMenu);
        document.addEventListener('keydown', evt => {
            if (!menuContainer.classList.contains("hidden")) {
                switch (evt.key) {
                    case 'Escape':
                    case'Esc':
                        menuContainer.classList.add("hidden");
                        menuButton.focus();
                        break;
                }
            }
        });

        document.querySelector("body").addEventListener("click", (event) => {
            if (event.target != menuContainer && event.target != menuButton && !menuContainer.classList.contains("hidden")) {
                this.toggleMenu();
            }
        })
        document.querySelectorAll(".app-menu-container li.forward-to-page").forEach(item => {
            item.addEventListener("click", (event) => {
                this.showModal(event.currentTarget.getAttribute("modal-name"))
            })
        })
        document.getElementById("disagree-button").addEventListener("click", () => {
            this.submitTerms(false)
        })
        document.getElementById("agree-button").addEventListener("click", () => {
            this.submitTerms(true)
        })
        document.getElementById("scan-button").addEventListener("click", this.scanHandler)

    }
    addEventListeners();
}

const mainController = new MainController();

window.onload = async (event) => {
    await translate();
    mainController.checkOnboarding();
    document.querySelector(".page-container").classList.remove("hiddenElement");
    document.querySelector(".loader-container").setAttribute('style', 'display:none');
    setTimeout(() => {
        document.querySelector(".app-menu-container ").style.position = "absolute";
    }, 0);
}
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let epiDomain = urlParams.get("setdomain") || localStorage.getItem(constants.EPI_DOMAIN) || environment.epiDomain;
localStorage.setItem(constants.EPI_DOMAIN, epiDomain);

const systemEnvironmentsDomainsMap = {
    "LOCAL-DEV": "http://localhost:8080",
    "DEV": "http://dev.pladevs.com",
    "PLA-PREQA": "http://preqa.pladevs.com",
    "PLA-QA": "http://lpwa.plaqa.org"
}

let val = Object.values(systemEnvironmentsDomainsMap).find((item) => item === window.location.origin)
if (val) {
    let key = Object.keys(systemEnvironmentsDomainsMap).find(key => systemEnvironmentsDomainsMap[key] === val);
    document.querySelector(".system-env").innerText = key + " TEST SYSTEM"
}
window.mainController = mainController;

