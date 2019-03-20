/** @format */

/**
 * External dependencies
 */

import { defer, once } from 'lodash';
import debugFactory from 'debug';
import notices from 'notices';
import page from 'page';

/**
 * Internal dependencies
 */
import config from 'config';
import {
	ANALYTICS_SUPER_PROPS_UPDATE,
	JETPACK_DISCONNECT_RECEIVE,
	NOTIFICATIONS_PANEL_TOGGLE,
	ROUTE_SET,
	SELECTED_SITE_SET,
	SITE_DELETE_RECEIVE,
	SITE_RECEIVE,
	SITES_RECEIVE,
	SITES_ONCE_CHANGED,
	SELECTED_SITE_SUBSCRIBE,
	SELECTED_SITE_UNSUBSCRIBE,
} from 'state/action-types';
import analytics from 'lib/analytics';
import cartStore from 'lib/cart/store';
import userFactory from 'lib/user';
import hasSitePendingAutomatedTransfer from 'state/selectors/has-site-pending-automated-transfer';
import isFetchingAutomatedTransferStatus from 'state/selectors/is-fetching-automated-transfer-status';
import isNotificationsOpen from 'state/selectors/is-notifications-open';
import { getSelectedSite, getSelectedSiteId } from 'state/ui/selectors';
import { getCurrentUserEmail, getCurrentUserSiteCount } from 'state/current-user/selectors';
import keyboardShortcuts from 'lib/keyboard-shortcuts';
import getGlobalKeyboardShortcuts from 'lib/keyboard-shortcuts/global';
import { fetchAutomatedTransferStatus } from 'state/automated-transfer/actions';
import {
	createImmediateLoginMessage,
	createPathWithoutImmediateLoginInformation,
} from 'state/immediate-login/utils';
import { saveImmediateLoginInformation } from 'state/immediate-login/actions';

const debug = debugFactory( 'calypso:state:middleware' );
const user = userFactory();

/**
 * Module variables
 */
const globalKeyBoardShortcutsEnabled = config.isEnabled( 'keyboard-shortcuts' );
let globalKeyboardShortcuts;

if ( globalKeyBoardShortcutsEnabled ) {
	globalKeyboardShortcuts = getGlobalKeyboardShortcuts();
}

const desktop = config.isEnabled( 'desktop' ) ? require( 'lib/desktop' ).default : null;

/**
 * Notifies user about the fact that they were automatically logged in
 * via an immediate link.
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 * @param {function} getState - redux getState function
 */
const notifyAboutImmediateLoginLinkEffects = once( ( dispatch, action, getState ) => {
	if ( ! action.query.immediate_login_attempt ) {
		return;
	}

	// Store immediate login information for future reference.
	dispatch(
		saveImmediateLoginInformation(
			action.query.immediate_login_success,
			action.query.login_reason,
			action.query.login_email,
			action.query.login_locale
		)
	);

	// Redirect to a page without immediate login information in the URL
	page.replace( createPathWithoutImmediateLoginInformation( action.path, action.query ) );

	// Only show the message if the user is currently logged in and if the URL
	// suggests that they were just logged in via an immediate login request.
	if ( ! action.query.immediate_login_success ) {
		return;
	}
	const email = getCurrentUserEmail( getState() );
	if ( ! email ) {
		return;
	}

	// Let redux process all dispatches that are currently queued and show the message
	defer( () => {
		notices.success( createImmediateLoginMessage( action.query.login_reason, email ) );
	} );
} );

/*
 * Object holding functions that will be called once selected site changes.
 */
let selectedSiteChangeListeners = [];

/**
 * Calls the listeners to selected site.
 *
 * @param {function} dispatch - redux dispatch function
 * @param {number} siteId     - the selected site id
 */
const updateSelectedSiteIdForSubscribers = ( dispatch, { siteId } ) => {
	selectedSiteChangeListeners.forEach( listener => listener( siteId ) );
};

/**
 * Registers a listener function to be fired once selected site changes.
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 */
const receiveSelectedSitesChangeListener = ( dispatch, action ) => {
	debug( 'receiveSelectedSitesChangeListener' );
	selectedSiteChangeListeners.push( action.listener );
};

/**
 * Removes a selectedSite listener.
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 */
const removeSelectedSitesChangeListener = ( dispatch, action ) => {
	debug( 'removeSelectedSitesChangeListener' );
	selectedSiteChangeListeners = selectedSiteChangeListeners.filter(
		listener => listener !== action.listener
	);
};

/*
 * Queue of functions waiting to be called once (and only once) when sites data
 * arrives (SITES_RECEIVE). Provides an alternative to `sites.once()` from the
 * legacy Sites List.
 */
let sitesListeners = [];

/**
 * Sets the selectedSite and siteCount for lib/analytics. This is used to
 * populate extra fields on tracks analytics calls.
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 * @param {function} getState - redux getState function
 */
const updateSelectedSiteForAnalytics = ( dispatch, action, getState ) => {
	const state = getState();
	const selectedSite = getSelectedSite( state );
	const siteCount = getCurrentUserSiteCount( state );
	analytics.setSelectedSite( selectedSite );
	analytics.setSiteCount( siteCount );
};

/**
 * Sets the selectedSiteId for lib/cart/store
 *
 * @param {function} dispatch - redux dispatch function
 * @param {number}   siteId   - the selected siteId
 */
const updateSelectedSiteForCart = ( dispatch, { siteId } ) => {
	cartStore.setSelectedSiteId( siteId );
};

/**
 * Sets the selectedSite for lib/keyboard-shortcuts/global
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 * @param {function} getState - redux getState function
 */
const updatedSelectedSiteForKeyboardShortcuts = ( dispatch, action, getState ) => {
	const state = getState();
	const selectedSite = getSelectedSite( state );
	globalKeyboardShortcuts.setSelectedSite( selectedSite );
};

/**
 * Sets isNotificationOpen for lib/keyboard-shortcuts
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 * @param {function} getState - redux getState function
 */
const updateNotificationsOpenForKeyboardShortcuts = ( dispatch, action, getState ) => {
	// flip the state here, since the reducer hasn't had a chance to update yet
	const toggledState = ! isNotificationsOpen( getState() );
	keyboardShortcuts.setNotificationsOpen( toggledState );
};

/**
 * Sets the selected site for lib/desktop
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 * @param {function} getState - redux getState function
 */
const updateSelectedSiteForDesktop = ( dispatch, action, getState ) => {
	const state = getState();
	const selectedSite = getSelectedSite( state );
	desktop.setSelectedSite( selectedSite );
};

/**
 * Registers a listener function to be fired once there are changes to sites
 * state.
 *
 * @param {function} dispatch - redux dispatch function
 * @param {object}   action   - the dispatched action
 */
const receiveSitesChangeListener = ( dispatch, action ) => {
	debug( 'receiveSitesChangeListener' );
	sitesListeners.push( action.listener );
};

const fetchAutomatedTransferStatusForSelectedSite = ( dispatch, getState ) => {
	const state = getState();
	const siteId = getSelectedSiteId( state );
	const isFetchingATStatus = isFetchingAutomatedTransferStatus( state, siteId );

	if ( ! isFetchingATStatus && hasSitePendingAutomatedTransfer( state, siteId ) ) {
		dispatch( fetchAutomatedTransferStatus( siteId ) );
	}
};

/**
 * Calls all functions registered as listeners of site-state changes.
 */
const fireChangeListeners = () => {
	debug( 'firing', sitesListeners.length, 'emitters' );
	sitesListeners.forEach( listener => listener() );
	sitesListeners = [];
};

const handler = ( dispatch, action, getState ) => {
	switch ( action.type ) {
		case ROUTE_SET:
			return notifyAboutImmediateLoginLinkEffects( dispatch, action, getState );

		case ANALYTICS_SUPER_PROPS_UPDATE:
			return updateSelectedSiteForAnalytics( dispatch, action, getState );

		//when the notifications panel is open keyboard events should not fire.
		case NOTIFICATIONS_PANEL_TOGGLE:
			return updateNotificationsOpenForKeyboardShortcuts( dispatch, action, getState );

		case SELECTED_SITE_SET:
			//let this fall through
			updateSelectedSiteForCart( dispatch, action );
			updateSelectedSiteIdForSubscribers( dispatch, action );

		case SITE_RECEIVE:
		case SITES_RECEIVE:
			// Wait a tick for the reducer to update the state tree
			setTimeout( () => {
				if ( action.type === SITES_RECEIVE ) {
					fireChangeListeners();
				}
				if ( globalKeyBoardShortcutsEnabled ) {
					updatedSelectedSiteForKeyboardShortcuts( dispatch, action, getState );
				}
				if ( config.isEnabled( 'desktop' ) ) {
					updateSelectedSiteForDesktop( dispatch, action, getState );
				}

				fetchAutomatedTransferStatusForSelectedSite( dispatch, getState );
			}, 0 );
			return;

		case SITES_ONCE_CHANGED:
			receiveSitesChangeListener( dispatch, action );
			return;
		case SELECTED_SITE_SUBSCRIBE:
			receiveSelectedSitesChangeListener( dispatch, action );
			return;
		case SELECTED_SITE_UNSUBSCRIBE:
			removeSelectedSitesChangeListener( dispatch, action );
			return;

		case SITE_DELETE_RECEIVE:
		case JETPACK_DISCONNECT_RECEIVE:
			user.decrementSiteCount();
			return;
	}
};

export const libraryMiddleware = ( { dispatch, getState } ) => next => action => {
	handler( dispatch, action, getState );

	return next( action );
};

export default libraryMiddleware;
