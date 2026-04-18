
import axios from 'axios';
import { LICENSE_KEY_STORE, PC_IAP_LIFETIME_PRODUCT_ID, PREMIUM_TOKENS_USED_STORE, PREMIUM_TOKENS_RESET_AT_STORE } from '../../common/utils/constants';
import { setKeyValue, getKeyValue } from '../app/app';
import { store } from '@/app/store';
import { setLicenseKeyObject, setPlan, setPremiumTokensUsed } from '@/features/app/appSlice';

async function onSetLicenseKey(licenseKey: string, inputPurchasedEmail: string) {
	let validateRes;
	try {
		// validateRes = await axios.post(`https://api.gumroad.com/v2/licenses/verify?product_permalink=annual&license_key=${licenseKey.trim()}`);
		validateRes = await axios.post(`https://api.lemonsqueezy.com/v1/licenses/validate`, { license_key: licenseKey });
	} catch (e2) {
		return {
			success: false,
			e: (e2 as any).response?.data?.error,
		};
	}

	if (!validateRes) {
		return {
			success: false,
			e: "not found",
		};
	}

	if (!validateRes?.data.valid) {
		return {
			success: false,
			e: "license key not valid",
		};
	}

	const instance_name = PC_IAP_LIFETIME_PRODUCT_ID;

    const { meta, license_key } = validateRes.data;
    const { product_name, customer_email } = meta;
    const { activation_limit, activation_usage } = license_key;

    // console.log(123, product_name, customer_email, activation_limit, activation_usage, validateRes.data);

    if (product_name !== instance_name) {
        return {
            success: false,
            e: "license key not for this product",
        };
    }

    if (customer_email !== inputPurchasedEmail) {
        return {
            success: false,
            e: "license key not for this email",
        };
    }

    if (activation_limit === 0) {
        return {
            success: false,
            e: "license key not active",
        };
    }

    if (activation_usage >= activation_limit) {
        return {
            success: false,
            e: "license key already exceeded the activation limit",
        };
    }

    let instance_id: string;
    try {
        // validateRes = await axios.post(`https://api.gumroad.com/v2/licenses/verify?product_permalink=annual&license_key=${licenseKey.trim()}`);
        const activateRes = await axios.post(`https://api.lemonsqueezy.com/v1/licenses/activate`, {
            license_key: licenseKey,
            instance_name,
        });
        instance_id = activateRes.data.instance.id;
    } catch (e2) {
        return {
            success: false,
            e: (e2 as any).response?.data?.error,
        };
    }

    setKeyValue(LICENSE_KEY_STORE, {license_key: licenseKey, instance_id, instance_name});

    store.dispatch(setPlan('paid'));
    store.dispatch(setLicenseKeyObject({ license_key: licenseKey, instance_id, instance_name }));

    return {
        success: true,
    };
}

async function getLicenseKeyAction(licenseKey: string) {
    try {
        const res = await axios.post(`https://api.lemonsqueezy.com/v1/licenses/validate`, { license_key: licenseKey });
        return {
            success: true,
            license_key: res.data.license_key,
        };
    } catch (e2) {
        return {
            success: false,
            e: (e2 as any).response?.data?.error,
        };
    }
}

async function onRemoveLicenseKey(licenseKey: string, instance_id: string) {
    try {
        const res = await axios.post(`https://api.lemonsqueezy.com/v1/licenses/deactivate`, { license_key: licenseKey, instance_id });
        return {
            success: true,
            license_key: res.data.license_key,
        };
    } catch (e2) {
        return {
            success: false,
            e: (e2 as any).response?.data?.error,
        };
    }
}

async function checkLicenseKey() {
	const licenseKey = await getKeyValue(LICENSE_KEY_STORE);
	// @ts-ignore
	const key = licenseKey?.value ? licenseKey.value : {};
	if (key.license_key && key.instance_id && key.instance_name) {
		store.dispatch(setPlan('paid'));

		axios.post("https://api.lemonsqueezy.com/v1/licenses/validate",
			{
				license_key: key.license_key || '',	
				instance_id: key.instance_id || '',
			}
		)
			.then(data => {
				if (data.data.valid) {
					store.dispatch(setPlan('paid'));
				} else {
					store.dispatch(setPlan('free'));
				}
			})
			.catch(e => {
				console.log('validateStoredLicenseKeyRes', e);
			});

		store.dispatch(setLicenseKeyObject(key));
	}
}

async function checkPremiumTokens() {
	const premiumTokensUsed = await getKeyValue(PREMIUM_TOKENS_USED_STORE);
	// @ts-ignore
	const used = premiumTokensUsed?.value ? premiumTokensUsed.value : 0;
	store.dispatch(setPremiumTokensUsed(used));

	const resetAt = await getKeyValue(PREMIUM_TOKENS_RESET_AT_STORE);
	// @ts-ignore
	const resetAtEPOCTime = resetAt?.value ? resetAt.value : 0;

	// console.log('resetAtEPOCTime', resetAtEPOCTime);

	if (resetAtEPOCTime >= 0) {
		const now = Date.now();
		if (now > resetAtEPOCTime + (24 * 60 * 60 * 1000)) {
			// Tokens reset, reset used count to 0
			await setKeyValue(PREMIUM_TOKENS_USED_STORE, 0);
			store.dispatch(setPremiumTokensUsed(0));
			await setKeyValue(PREMIUM_TOKENS_RESET_AT_STORE, now);
		}
	}
}

export {
    onSetLicenseKey,
    getLicenseKeyAction,
    onRemoveLicenseKey,
		checkLicenseKey,
		checkPremiumTokens,
};
