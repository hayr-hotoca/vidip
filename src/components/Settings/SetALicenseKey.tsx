import { Input } from "@/common/components/ui/input";
import { Button } from "@/common/components/ui/button";
import { Spinner } from "@/common/components/ui/spinner";
import { useState } from "react";
import { notify, validateEmail } from "@/features/app/app";
import { onSetLicenseKey } from "@/features/license/license";

function SetALicenseKey() {
	const [email, setEmail] = useState('');
	const [licenseKey, setLicenseKey] = useState('');
	const [APICalling, setAPICalling] = useState(false);

  return (
    <div>
			<Input type="email" placeholder="purchased email address" value={email} onChange={(e) => setEmail(e.target.value)} />
			<Input placeholder="license key" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} />
			<Button
				className="float-right mt-4"
				disabled={APICalling}
				onClick={async () => {
					if (!validateEmail(email)) {
						notify(
							'Please enter a valid email address',
							'error',
						);
						return;
					}

					if (!licenseKey) {
						notify(
							'Please enter a license key',
							'error',
						);
						return;
					}

					setAPICalling(true);

					setTimeout(async () => {
						const validateReceiptRes = await onSetLicenseKey(licenseKey, email);
						if (!validateReceiptRes.success) {
							notify(validateReceiptRes.e, 'error');
							setAPICalling(false);
							return;
						}
						// setEmail('');
						// setLicenseKey('');
						setAPICalling(false);

						// console.log(email, licenseKey, validateReceiptRes);
					}, 50);
				}}
				>
					{APICalling && <Spinner />}
					Set License Key
				</Button>
		</div>
  )
}

export default SetALicenseKey