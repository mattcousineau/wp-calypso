/** @format **/
/**
 * Externel dependencies
 */
import { noop } from 'lodash';
import i18n from 'i18n-calypso';

/**
 * Internal dependencies
 */
import {
	DNS_ADD,
	DNS_ADD_COMPLETED,
	DNS_ADD_FAILED,
	DNS_APPLY_TEMPLATE_COMPLETED,
	DNS_DELETE,
	DNS_DELETE_COMPLETED,
	DNS_DELETE_FAILED,
	DNS_FETCH,
	DNS_FETCH_COMPLETED,
	DNS_FETCH_FAILED,
	DOMAIN_TRANSFER_ACCEPT_COMPLETED,
	DOMAIN_TRANSFER_CANCEL_REQUEST_COMPLETED,
	DOMAIN_TRANSFER_CODE_REQUEST_COMPLETED,
	DOMAIN_TRANSFER_DECLINE_COMPLETED,
	ICANN_VERIFICATION_RESEND_COMPLETED,
	NAMESERVERS_FETCH,
	NAMESERVERS_FETCH_COMPLETED,
	NAMESERVERS_FETCH_FAILED,
	NAMESERVERS_UPDATE_COMPLETED,
	PRIMARY_DOMAIN_SET,
	PRIVACY_PROTECTION_ENABLE_COMPLETED,
	SITE_REDIRECT_FETCH,
	SITE_REDIRECT_FETCH_COMPLETED,
	SITE_REDIRECT_FETCH_FAILED,
	SITE_REDIRECT_NOTICE_CLOSE,
	SITE_REDIRECT_UPDATE,
	SITE_REDIRECT_UPDATE_COMPLETED,
	SITE_REDIRECT_UPDATE_FAILED,
	WAPI_DOMAIN_INFO_FETCH,
	WAPI_DOMAIN_INFO_FETCH_COMPLETED,
	WAPI_DOMAIN_INFO_FETCH_FAILED,
} from 'lib/upgrades/action-types';
import Dispatcher from 'dispatcher';
import DnsStore from 'lib/domains/dns/store';
import NameserversStore from 'lib/domains/nameservers/store';
import { requestSite } from 'state/sites/actions';
import wapiDomainInfoAssembler from 'lib/domains/wapi-domain-info/assembler';
import WapiDomainInfoStore from 'lib/domains/wapi-domain-info/store';
import wp from 'lib/wp';
import debugFactory from 'debug';
import { isBeingProcessed } from 'lib/domains/dns';
import { fetchSiteDomains } from 'state/sites/domains/actions';

const debug = debugFactory( 'actions:domain-management' );

const wpcom = wp.undocumented();

export const setPrimaryDomain = ( siteId, domainName, onComplete = noop ) => dispatch => {
	debug( 'setPrimaryDomain', siteId, domainName );
	Dispatcher.handleViewAction( {
		type: PRIMARY_DOMAIN_SET,
		siteId,
	} );
	wpcom.setPrimaryDomain( siteId, domainName, ( error, data ) => {
		if ( error ) {
			return onComplete( error, data );
		}

		fetchSiteDomains( siteId )( dispatch ).then( () => {
			onComplete( null, data );
			requestSite( siteId )( dispatch );
		} );
	} );
};

export function fetchDns( domainName ) {
	const dns = DnsStore.getByDomainName( domainName );

	if ( dns.isFetching || dns.hasLoadedFromServer ) {
		return;
	}

	Dispatcher.handleViewAction( {
		type: DNS_FETCH,
		domainName,
	} );

	wpcom.fetchDns( domainName, ( error, data ) => {
		if ( ! error ) {
			Dispatcher.handleServerAction( {
				type: DNS_FETCH_COMPLETED,
				records: data && data.records,
				domainName,
			} );
		} else {
			Dispatcher.handleServerAction( {
				type: DNS_FETCH_FAILED,
				domainName,
			} );
		}
	} );
}

export function addDns( domainName, record, onComplete ) {
	Dispatcher.handleServerAction( {
		type: DNS_ADD,
		domainName,
		record,
	} );

	const dns = DnsStore.getByDomainName( domainName );

	wpcom.updateDns( domainName, dns.records, error => {
		const type = ! error ? DNS_ADD_COMPLETED : DNS_ADD_FAILED;
		Dispatcher.handleServerAction( {
			type,
			domainName,
			record,
		} );

		onComplete( error );
	} );
}

export function deleteDns( domainName, record, onComplete ) {
	if ( isBeingProcessed( record ) ) {
		return;
	}

	Dispatcher.handleServerAction( {
		type: DNS_DELETE,
		domainName,
		record,
	} );

	const dns = DnsStore.getByDomainName( domainName );

	wpcom.updateDns( domainName, dns.records, error => {
		const type = ! error ? DNS_DELETE_COMPLETED : DNS_DELETE_FAILED;

		Dispatcher.handleServerAction( {
			type,
			domainName,
			record,
		} );

		onComplete( error );
	} );
}

export function applyDnsTemplate( domainName, provider, service, variables, onComplete ) {
	wpcom.applyDnsTemplate( domainName, provider, service, variables, ( error, data ) => {
		if ( ! error ) {
			Dispatcher.handleServerAction( {
				type: DNS_APPLY_TEMPLATE_COMPLETED,
				records: data && data.records,
				domainName,
			} );
		}
		onComplete( error );
	} );
}

export function fetchNameservers( domainName ) {
	const nameservers = NameserversStore.getByDomainName( domainName );

	if ( nameservers.isFetching || nameservers.hasLoadedFromServer ) {
		return;
	}

	Dispatcher.handleViewAction( {
		type: NAMESERVERS_FETCH,
		domainName,
	} );

	wpcom.nameservers( domainName, ( error, data ) => {
		if ( error ) {
			Dispatcher.handleServerAction( {
				type: NAMESERVERS_FETCH_FAILED,
				domainName,
			} );
		} else {
			Dispatcher.handleServerAction( {
				type: NAMESERVERS_FETCH_COMPLETED,
				domainName,
				nameservers: data,
			} );
		}
	} );
}

export function updateNameservers( domainName, nameservers, onComplete ) {
	const postData = nameservers.map( nameserver => {
		return {
			nameserver,
		};
	} );

	wpcom.updateNameservers( domainName, { nameservers: postData }, error => {
		if ( ! error ) {
			Dispatcher.handleServerAction( {
				type: NAMESERVERS_UPDATE_COMPLETED,
				domainName,
				nameservers,
			} );
		}

		onComplete( error );
	} );
}

export function resendIcannVerification( domainName, onComplete ) {
	wpcom.resendIcannVerification( domainName, error => {
		if ( ! error ) {
			Dispatcher.handleServerAction( {
				type: ICANN_VERIFICATION_RESEND_COMPLETED,
				domainName,
			} );
		}

		onComplete( error );
	} );
}

export function closeSiteRedirectNotice( siteId ) {
	Dispatcher.handleViewAction( {
		type: SITE_REDIRECT_NOTICE_CLOSE,
		siteId,
	} );
}

export function fetchSiteRedirect( siteId ) {
	Dispatcher.handleViewAction( {
		type: SITE_REDIRECT_FETCH,
		siteId,
	} );

	wpcom.getSiteRedirect( siteId, ( error, data ) => {
		if ( data && data.location ) {
			Dispatcher.handleServerAction( {
				type: SITE_REDIRECT_FETCH_COMPLETED,
				location: data.location,
				siteId,
			} );
		} else if ( error && error.message ) {
			Dispatcher.handleServerAction( {
				type: SITE_REDIRECT_FETCH_FAILED,
				error: error.message,
				siteId,
			} );
		} else {
			Dispatcher.handleServerAction( {
				type: SITE_REDIRECT_FETCH_FAILED,
				error: i18n.translate(
					'There was a problem retrieving the redirect settings. Please try again later or contact support.'
				),
				siteId,
			} );
		}
	} );
}

export function updateSiteRedirect( siteId, location, onComplete ) {
	Dispatcher.handleViewAction( {
		type: SITE_REDIRECT_UPDATE,
		siteId,
	} );

	wpcom.setSiteRedirect( siteId, location, ( error, data ) => {
		let success = false;

		if ( data && data.success ) {
			Dispatcher.handleServerAction( {
				type: SITE_REDIRECT_UPDATE_COMPLETED,
				location,
				siteId,
				success: i18n.translate( 'The redirect settings were updated successfully.' ),
			} );

			success = true;
		} else if ( error && error.message ) {
			Dispatcher.handleServerAction( {
				type: SITE_REDIRECT_UPDATE_FAILED,
				error: error.message,
				siteId,
			} );
		} else {
			Dispatcher.handleServerAction( {
				type: SITE_REDIRECT_UPDATE_FAILED,
				error: i18n.translate(
					'There was a problem updating the redirect settings. Please try again later or contact support.'
				),
				siteId,
			} );
		}

		onComplete( success );
	} );
}

export function fetchWapiDomainInfo( domainName ) {
	const wapiDomainInfo = WapiDomainInfoStore.getByDomainName( domainName );

	if ( ! wapiDomainInfo.needsUpdate ) {
		return;
	}

	Dispatcher.handleViewAction( {
		type: WAPI_DOMAIN_INFO_FETCH,
		domainName,
	} );

	wpcom.fetchWapiDomainInfo( domainName, ( error, status ) => {
		if ( error ) {
			Dispatcher.handleServerAction( {
				type: WAPI_DOMAIN_INFO_FETCH_FAILED,
				error,
				domainName,
			} );

			return;
		}

		Dispatcher.handleServerAction( {
			type: WAPI_DOMAIN_INFO_FETCH_COMPLETED,
			status: wapiDomainInfoAssembler.createDomainObject( status ),
			domainName,
		} );
	} );
}

export function requestTransferCode( options, onComplete ) {
	const { siteId, domainName, unlock, disablePrivacy } = options;

	wpcom.requestTransferCode( options, error => {
		if ( error ) {
			onComplete( error );
			return;
		}

		Dispatcher.handleServerAction( {
			type: DOMAIN_TRANSFER_CODE_REQUEST_COMPLETED,
			siteId,
			domainName,
			unlock,
			disablePrivacy,
		} );

		onComplete( null );
	} );
}

export function cancelTransferRequest( options, onComplete ) {
	wpcom.cancelTransferRequest( options, error => {
		if ( error ) {
			onComplete( error );
			return;
		}

		Dispatcher.handleServerAction( {
			type: DOMAIN_TRANSFER_CANCEL_REQUEST_COMPLETED,
			domainName: options.domainName,
			locked: options.lockDomain,
		} );

		if ( options.enablePrivacy ) {
			Dispatcher.handleServerAction( {
				type: PRIVACY_PROTECTION_ENABLE_COMPLETED,
				siteId: options.siteId,
				domainName: options.domainName,
			} );
		}

		onComplete( null );
	} );
}

export function enablePrivacyProtection( domainName, onComplete ) {
	wpcom.enablePrivacyProtection( domainName, error => {
		if ( error ) {
			onComplete( error );
			return;
		}

		Dispatcher.handleServerAction( {
			type: PRIVACY_PROTECTION_ENABLE_COMPLETED,
			domainName,
		} );

		onComplete( null );
	} );
}

export function disablePrivacyProtection( domainName, onComplete ) {
	wpcom.disablePrivacyProtection( domainName, error => {
		if ( error ) {
			onComplete( error );
			return;
		}

		onComplete( null );
	} );
}

export function acceptTransfer( domainName, onComplete ) {
	wpcom.acceptTransfer( domainName, error => {
		if ( error ) {
			onComplete( error );
			return;
		}

		Dispatcher.handleServerAction( {
			type: DOMAIN_TRANSFER_ACCEPT_COMPLETED,
			domainName,
		} );

		onComplete( null );
	} );
}

export function declineTransfer( domainName, onComplete ) {
	wpcom.declineTransfer( domainName, error => {
		if ( error ) {
			onComplete( error );
			return;
		}

		Dispatcher.handleServerAction( {
			type: DOMAIN_TRANSFER_DECLINE_COMPLETED,
			domainName,
		} );

		onComplete( null );
	} );
}

export function requestGdprConsentManagementLink( domainName, onComplete ) {
	wpcom.requestGdprConsentManagementLink( domainName, onComplete );
}
