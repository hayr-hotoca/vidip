import { Mail, Link as LinkIcon, Twitter, Instagram, Copy } from "lucide-react"
import { Card, CardContent } from "@/common/components/ui/card"
import { Button } from "@/common/components/ui/button"
import { Input } from "@/common/components/ui/input"
import { toast } from "sonner"
import { getDevicePlatform, openLink } from "@/features/app/app"
import { RootState } from "@/app/store"
import { useSelector } from "react-redux"
import { APP_VERSION } from "@/common/utils/constants"
import { useTranslation } from "react-i18next"

export default function Contact() {
	const { t } = useTranslation();
  const {
    contact,
  } = useSelector((state: RootState) => state.app);

  const copyEmail = () => {
    navigator.clipboard.writeText(contact.supportEmail)
    toast(t('Copied'), {
      description: t("Email address copied to clipboard."),
    })
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <p className="text-muted-foreground">
          {t('Feel free to contact')}
        </p>
      </div>

      {/* Contact Options */}
      <Card className="divide-y px-1 py-2">
        <CardContent className="p-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 p-4"
            asChild
          >
            <a
							className="cursor-pointer"
              onClick={() => {
                const mailData = `mailto:${contact.supportEmail}?body=\n\nVidip v${APP_VERSION} on ${getDevicePlatform()}`;
                openLink(mailData);
              }}
						>
              <Mail className="h-5 w-5" />
              {t('Send us an email')}
            </a>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 p-4"
            asChild
          >
            <a href={contact.website} target="_blank" rel="noreferrer">
              <LinkIcon className="h-5 w-5" />
              {contact.website}
            </a>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 p-4"
            asChild
          >
            <a href={contact.x} target="_blank" rel="noreferrer">
              <Twitter className="h-5 w-5" />
              {t('Follow us on')} X (Twitter)
            </a>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 p-4"
            asChild
          >
            <a href={contact.instagram} target="_blank" rel="noreferrer">
              <Instagram className="h-5 w-5" />
              {t('Follow us on')} Instagram
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Email Copy Box */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={contact.supportEmail}
            className="font-medium"
          />
          <Button size="icon" variant="outline" onClick={copyEmail}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('Click to copy email address to clipboard')}
        </p>
      </div>

      {/* Footer note */}
      <p className="text-sm text-muted-foreground">
        {t('Your feedback, suggestions, or issues')}
      </p>
    </div>
  )
}
