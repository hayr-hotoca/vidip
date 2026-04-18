import { AppDispatch, RootState } from "@/app/store";
import { deleteKeyValue, notify } from "@/features/app/app";
import { getLicenseKeyAction, onRemoveLicenseKey } from "@/features/license/license";
import { useDispatch } from "react-redux";
import { t } from "i18next";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { setLicenseKeyObject, setPlan } from "@/features/app/appSlice";
import { LICENSE_KEY_STORE } from "@/common/utils/constants";
import { Alert } from "@/common/components/Alert";

function ManagePremiumAccess() {
  const dispatch = useDispatch<AppDispatch>();
  const { licenseKeyObject } = useSelector((state: RootState) => state.app);console.log(100, licenseKeyObject)

	const [licenseKeyActivation, setLicenseKeyActivation] = useState<Object>({});
	const [APICalling, setAPICalling] = useState<boolean>(false);

	useEffect(() => {
		(async () => {
			const res = await getLicenseKeyAction((licenseKeyObject as any)?.license_key || '');
			if (res?.success) {
				setLicenseKeyActivation(res.license_key);
			}
		})()
	}, []);

  return (
    <div>
			<div>Devices left can be upgraded to premium with the license key {(licenseKeyObject as any)?.license_key || 'N/A'}: <strong>{(licenseKeyActivation as any)?.activation_usage || t('loading')}</strong> out of <strong>{(licenseKeyActivation as any)?.activation_limit || t('loading')}</strong></div>

			<div className="float-right mt-4">
				<Alert
					triggerElement="Remove this device from premium access"
					onActionClick={() => {
						try {
							setAPICalling(true);

							setTimeout(async () => {
								const deactiveRes = await onRemoveLicenseKey((licenseKeyObject as any)?.license_key || '', (licenseKeyObject as any)?.instance_id || '');
								if (!deactiveRes.success) {
									notify(deactiveRes.e, 'error');
									setAPICalling(false);
									return;
								}

								notify('License key deactivated successfully', 'success');
								dispatch(setLicenseKeyObject({}));
								dispatch(setPlan('free'));
								await deleteKeyValue(LICENSE_KEY_STORE);

								setAPICalling(false);
							}, 50);
						} catch (error) {
							setAPICalling(false);
						}
					}}
					spinnerActive={APICalling || !(licenseKeyActivation as any)?.activation_limit}
				/>
			</div>
		</div>
  )
}

export default ManagePremiumAccess;
