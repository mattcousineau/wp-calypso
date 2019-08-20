/** @format */

/**
 * External dependencies
 */

import React from 'react';
import { localize } from 'i18n-calypso';

/**
 * Internal dependencies
 */
import PurchaseDetail from 'components/purchase-detail';

/**
 * Image dependencies
 */
import paymentsImage from 'assets/images/illustrations/payments.svg';

export default localize( ( { isJetpack, translate } ) => {
	return (
		<div className="product-purchase-features-list__item">
			<PurchaseDetail
				buttonText={ translate( 'Sell online' ) }
				description={ translate(
					'Add a payment button to any post or page to collect PayPal payments for physical products, digital goods, services, or donations.'
				) }
				href={
					isJetpack
						? 'https://jetpack.com/support/simple-payment-button/'
						: 'https://en.support.wordpress.com/simple-payments/'
				}
				icon={ <img alt="" src={ paymentsImage } /> }
				target="_blank"
				title={ translate( 'Sell online with PayPal' ) }
			/>
		</div>
	);
} );
