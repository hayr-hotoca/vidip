
import { useTranslation } from "react-i18next";
import { APP_VERSION, DARK_MODE, DISPLAY_THEME_LOCALSTORAGE, LANGUAGE_LOCALSTORAGE, LIGHT_MODE, SYSTEM_BASED } from "@/common/utils/constants";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/app/store";

import { Card, CardContent } from "@/common/components/ui/card";
import { Button } from "@/common/components/ui/button";
import { Separator } from "@/common/components/ui/separator";
import {
  ChevronRight,
  Crown,
  Mail,
  Languages,
  Moon,
  KeyIcon,
} from "lucide-react";

import { SelectScrollable } from "./SelectScrollable";
import { setCurrentDisplayTheme, setCurrentLanguage } from "@/features/settings/settingsSlice";
import Modal from "@/common/components/Modal";
import Contact from "./Contact";
import { getDevicePlatform, openLink } from "@/features/app/app";
import SetALicenseKey from "./SetALicenseKey";
import ManagePremiumAccess from "./ManagePremiumAccess";

const Settings = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const {
    currentLanguage,
    currentDisplayTheme,
  } = useSelector((state: RootState) => state.settings);
  const {
    contact,
    plan,
  } = useSelector((state: RootState) => state.app);

  return (
    <div className="max-h-[75vh] overflow-auto bg-gray-100 p-4">
      <Card className="max-w-md mx-auto">

        <CardContent className="space-y-6">
          {/* Pro Upgrade Section */}
          {plan === 'free' && <div className="bg-amber-50 p-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center">
              <Crown className="h-5 w-5 text-amber-600 mr-2" />
              <div>
                <h3 className="font-medium text-amber-800">
                  {t('Unlock')} Vidip Pro
                </h3>
                <p className="text-sm text-amber-600">
                  {t('Get access to all premium features')}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-amber-700">
              {t('Upgrade')}
            </Button>
          </div>}

          <Separator />

          {/* App Section */}
          <div className="shadcn-button">
            <h3 className="font-medium flex items-center mb-3">
              {t('App')}
            </h3>
            <div className="space-y-2 pl-2">
            <div className="flex justify-between items-center py-2">
                <span className="flex">
                  <Moon className="mr-2" />
                  <span>{t('Display')}</span>
                </span>
                <span className="text-gray-500">
                  <SelectScrollable
                    placeholder="display theme"
                    defaultValue={currentDisplayTheme}
                    items={[
                      {name: t('System Based'), value: SYSTEM_BASED},
                      {name: t('Light Mode'), value: LIGHT_MODE},
                      {name: t('Dark Mode'), value: DARK_MODE},
                    ]}
                    onValueChange={(text: string) => {
                      dispatch(setCurrentDisplayTheme(text));
                      localStorage.setItem(DISPLAY_THEME_LOCALSTORAGE, text);
                    }}
                  />
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="flex">
                  <Languages className="mr-2" />
                  <span>{t('Language')}</span>
                </span>
                <span className="text-gray-500">
                  <SelectScrollable
                    placeholder="language"
                    defaultValue={currentLanguage}
                    items={[
                      {name: "🇺🇸 English", value: 'en'},
                      {name: "🇻🇳 Tiếng Việt", value: 'vi'},
                      {name: "🇪🇸 Spanish", value: 'es'},
                      {name: "🇫🇷 French", value: 'fr'},
                    ]}
                    onValueChange={(text: string) => {
                      i18n.changeLanguage(text);
                      dispatch(setCurrentLanguage(text));
                      localStorage.setItem(LANGUAGE_LOCALSTORAGE, text);
                    }}
                  />
                </span>
              </div>
              {plan === 'free' && <Modal
                modalTitleElement={
                  <span className="flex">
                    <KeyIcon className="h-4 w-4 mr-2" />
                    {t('Set a License Key')}
                  </span>
                }
                modalContentElement={<SetALicenseKey />}
                modalContentStyle={{ width: 450 }}
                triggerElement={
                  <div className="flex justify-between items-center py-2 cursor-pointer">
                    <span className="flex items-center">
                      <KeyIcon className="h-4 w-4 mr-2" />
                      <span>{t('Set a License Key')}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                }
              />}
              {plan === 'paid' && <Modal
                modalTitleElement={
                  <span className="flex">
                    <Crown className="h-4 w-4 mr-2" />
                    {t('Manage premium access')}
                  </span>
                }
                modalContentElement={<ManagePremiumAccess />}
                modalContentStyle={{ width: 450 }}
                triggerElement={
                  <div className="flex justify-between items-center py-2 cursor-pointer">
                    <span className="flex items-center">
                      <Crown className="h-4 w-4 mr-2" />
                      <span>{t('Manage premium access')}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                }
              />}
            </div>
          </div>

          <Separator />

          {/* Contact Section */}
          <div>
            <h3 className="font-medium flex items-center mb-3">
              {t('Contact')}
            </h3>
            <div className="space-y-2 pl-2">
              <SettingItem title={t("Contact")} />
              <SettingItem
                title={t("Send feedback")}
                onClick={() => {
                  const mailData = `mailto:${contact.supportEmail}?subject=Suggestion/Feedback for 1LimX&body=\n\nVidip v${APP_VERSION} on ${getDevicePlatform()}`;
                  openLink(mailData);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Helper component for settings items with chevron
  function SettingItem({ title, onClick = () => {} }
    : { title: string, onClick?: Function }) {
    if (title === t('Contact')) {
      return <Modal
        modalTitleElement={
          <span className="flex">
            <Mail className="h-4 w-4 mr-2" />
            {t('Contact')}
          </span>
        }
        modalContentElement={<Contact />}
        modalContentStyle={{ width: 450 }}
        triggerElement={
          <div className="flex justify-between items-center py-2 cursor-pointer">
            <span className="flex items-center">
              <Mail className="h-4 w-4 mr-2" />
              <span>{title}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        }
      />
    } else {
      return <div
        className="flex justify-between items-center py-2 cursor-pointer"
        onClick={() => onClick()}
      >
        <span className="flex items-center">
          <Mail className="h-4 w-4 mr-2" />
          <span>{title}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    }
  };
};

export default Settings;