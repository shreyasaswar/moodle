// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * A type of dialogue used as for choosing modules in a course.
 *
 * @module     core_course/activitychooser
 * @package    core_course
 * @copyright  2020 Mathew May <mathew.solutions>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import * as ChooserDialogue from 'core_course/local/activitychooser/dialogue';
import * as Repository from 'core_course/local/activitychooser/repository';
import selectors from 'core_course/local/activitychooser/selectors';
import CustomEvents from 'core/custom_interaction_events';
import * as Templates from 'core/templates';
import * as ModalFactory from 'core/modal_factory';
import {get_string as getString} from 'core/str';
import Pending from 'core/pending';

/**
 * Set up the activity chooser.
 *
 * @method init
 * @param {Number} courseId Course ID to use later on in fetchModules()
 */
export const init = courseId => {
    const pendingPromise = new Pending();

    registerListenerEvents(courseId);

    pendingPromise.resolve();
};

/**
 * Once a selection has been made make the modal & module information and pass it along
 *
 * @method registerListenerEvents
 * @param {Number} courseId
 */
const registerListenerEvents = (courseId) => {
    const events = [
        'click',
        CustomEvents.events.activate,
        CustomEvents.events.keyboardActivate
    ];

    const fetchModuleData = (() => {
        let innerPromise = null;

        return () => {
            if (!innerPromise) {
                innerPromise = new Promise((resolve) => {
                    resolve(Repository.activityModules(courseId));
                });
            }

            return innerPromise;
        };
    })();

    CustomEvents.define(document, events);

    // Display module chooser event listeners.
    events.forEach((event) => {
        document.addEventListener(event, async(e) => {
            if (e.target.closest(selectors.elements.sectionmodchooser)) {
                // We need to know who called this.
                // Standard courses use the ID in the main section info.
                const sectionDiv = e.target.closest(selectors.elements.section);
                // Front page courses need some special handling.
                const button = e.target.closest(selectors.elements.sectionmodchooser);
                // If we don't have a section ID use the fallback ID.
                const caller = sectionDiv || button;

                // We want to show the modal instantly but loading whilst waiting for our data.
                let bodyPromiseResolver;
                const bodyPromise = new Promise(resolve => {
                    bodyPromiseResolver = resolve;
                });

                const sectionModal = buildModal(bodyPromise);

                // Now we have a modal we should start fetching data.
                const data = await fetchModuleData();

                // Apply the section id to all the module instance links.
                const builtModuleData = sectionIdMapper(data, caller.dataset.sectionid);

                ChooserDialogue.displayChooser(
                    sectionModal,
                    builtModuleData,
                    partiallyAppliedFavouriteManager(data, caller.dataset.sectionid),
                );

                bodyPromiseResolver(await Templates.render(
                    'core_course/activitychooser',
                    templateDataBuilder(builtModuleData)
                ));
            }
        });
    });
};

/**
 * Given the web service data and an ID we want to make a deep copy
 * of the WS data then add on the section ID to the addoption URL
 *
 * @method sectionIdMapper
 * @param {Object} webServiceData Our original data from the Web service call
 * @param {Number} id The ID of the section we need to append to the links
 * @return {Array} [modules] with URL's built
 */
const sectionIdMapper = (webServiceData, id) => {
    // We need to take a fresh deep copy of the original data as an object is a reference type.
    const newData = JSON.parse(JSON.stringify(webServiceData));
    newData.content_items.forEach((module) => {
        module.link += '&section=' + id;
    });
    return newData.content_items;
};

/**
 * Given an array of modules we want to figure out where & how to place them into our template object
 *
 * @method templateDataBuilder
 * @param {Array} data our modules to manipulate into a Templatable object
 * @return {Object} Our built object ready to render out
 */
const templateDataBuilder = (data) => {
    // Filter the incoming data to find favourite & recommended modules.
    const favourites = data.filter(mod => mod.favourite === true);
    const recommended = data.filter(mod => mod.recommended === true);

    // Given the results of the above filters lets figure out what tab to set active.

    // We have some favourites.
    const favouritesFirst = !!favourites.length;
    // Check if we have no favourites but have some recommended.
    const recommendedFirst = !!(recommended.length && favouritesFirst === false);
    // We have nothing fallback to show all modules.
    const fallback = favouritesFirst === false && recommendedFirst === false;

    return {
        'default': data,
        favourites: favourites,
        recommended: recommended,
        favouritesFirst: favouritesFirst,
        recommendedFirst: recommendedFirst,
        fallback: fallback,
    };
};

/**
 * Given an object we want to build a modal ready to show
 *
 * @method buildModal
 * @param {Promise} bodyPromise
 * @return {Object} The modal ready to display immediately and render body in later.
 */
const buildModal = bodyPromise => {
    return ModalFactory.create({
        type: ModalFactory.types.DEFAULT,
        title: getString('addresourceoractivity'),
        body: bodyPromise,
        large: true,
        templateContext: {
            classes: 'modchooser'
        }
    })
    .then(modal => {
        modal.show();
        return modal;
    });
};

/**
 * A small helper function to handle the case where there are no more favourites
 * and we need to mess a bit with the available tabs in the chooser
 *
 * @method nullFavouriteDomManager
 * @param {HTMLElement} favouriteTabNav Dom node of the favourite tab nav
 * @param {HTMLElement} modalBody Our current modals' body
 */
const nullFavouriteDomManager = (favouriteTabNav, modalBody) => {
    favouriteTabNav.tabIndex = -1;
    favouriteTabNav.classList.add('d-none');
    // Need to set active to an available tab.
    if (favouriteTabNav.classList.contains('active')) {
        favouriteTabNav.classList.remove('active');
        favouriteTabNav.setAttribute('aria-selected', 'false');
        const favouriteTab = modalBody.querySelector(selectors.regions.favouriteTab);
        favouriteTab.classList.remove('active');
        const recommendedTabNav = modalBody.querySelector(selectors.regions.recommendedTabNav);
        const defaultTabNav = modalBody.querySelector(selectors.regions.defaultTabNav);
        if (recommendedTabNav.classList.contains('d-none') === false) {
            recommendedTabNav.classList.add('active');
            recommendedTabNav.setAttribute('aria-selected', 'true');
            recommendedTabNav.tabIndex = 0;
            recommendedTabNav.focus();
            const recommendedTab = modalBody.querySelector(selectors.regions.recommendedTab);
            recommendedTab.classList.add('active');
        } else {
            defaultTabNav.classList.add('active');
            defaultTabNav.setAttribute('aria-selected', 'true');
            defaultTabNav.tabIndex = 0;
            defaultTabNav.focus();
            const defaultTab = modalBody.querySelector(selectors.regions.defaultTab);
            defaultTab.classList.add('active');
        }

    }
};

/**
 * Export a curried function where the builtModules has been applied.
 * We have our array of modules so we can rerender the favourites area and have all of the items sorted.
 *
 * @method partiallyAppliedFavouriteManager
 * @param {Array} moduleData This is our raw WS data that we need to manipulate
 * @param {Number} sectionId We need this to add the sectionID to the URL's in the faves area after rerender
 * @return {Function} partially applied function so we can manipulate DOM nodes easily & update our internal array
 */
const partiallyAppliedFavouriteManager = (moduleData, sectionId) => {
    /**
     * Curried function that is being returned.
     *
     * @param {String} internal Internal name of the module to manage
     * @param {Boolean} favourite Is the caller adding a favourite or removing one?
     * @param {HTMLElement} modalBody What we need to update whilst we are here
     */
    return async(internal, favourite, modalBody) => {
        const favouriteArea = modalBody.querySelector(selectors.render.favourites);

        // eslint-disable-next-line max-len
        const favouriteButtons = modalBody.querySelectorAll(`[data-internal="${internal}"] ${selectors.actions.optionActions.manageFavourite}`);
        const favouriteTabNav = modalBody.querySelector(selectors.regions.favouriteTabNav);
        const result = moduleData.content_items.find(({name}) => name === internal);
        const newFaves = {};
        if (result) {
            if (favourite) {
                result.favourite = true;

                // eslint-disable-next-line camelcase
                newFaves.content_items = moduleData.content_items.filter(mod => mod.favourite === true);

                const builtFaves = sectionIdMapper(newFaves, sectionId);

                const {html, js} = await Templates.renderForPromise('core_course/local/activitychooser/favourites',
                    {favourites: builtFaves});

                await Templates.replaceNodeContents(favouriteArea, html, js);

                Array.from(favouriteButtons).forEach((element) => {
                    element.classList.remove('text-muted');
                    element.classList.add('text-primary');
                    element.dataset.favourited = 'true';
                    element.setAttribute('aria-pressed', true);
                    element.firstElementChild.classList.remove('fa-star-o');
                    element.firstElementChild.classList.add('fa-star');
                });

                favouriteTabNav.classList.remove('d-none');
            } else {
                result.favourite = false;

                const nodeToRemove = favouriteArea.querySelector(`[data-internal="${internal}"]`);

                nodeToRemove.parentNode.removeChild(nodeToRemove);

                Array.from(favouriteButtons).forEach((element) => {
                    element.classList.add('text-muted');
                    element.classList.remove('text-primary');
                    element.dataset.favourited = 'false';
                    element.setAttribute('aria-pressed', false);
                    element.firstElementChild.classList.remove('fa-star');
                    element.firstElementChild.classList.add('fa-star-o');
                });
                const newFaves = moduleData.content_items.filter(mod => mod.favourite === true);

                if (newFaves.length === 0) {
                    nullFavouriteDomManager(favouriteTabNav, modalBody);
                }
            }
        }
    };
};
