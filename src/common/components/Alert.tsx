import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/common/components/ui/alert-dialog"
import { Button } from "@/common/components/ui/button"
import { Spinner } from "@/common/components/ui/spinner"

export function Alert({
	triggerElement,
	onActionClick,
	spinnerActive,
}: {
	triggerElement: any,
	onActionClick: () => void,
	spinnerActive: boolean,
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {typeof triggerElement === 'string'
					? <Button
              variant="outline"
              disabled={spinnerActive}
            >{spinnerActive && <Spinner />} {triggerElement}</Button>
					: triggerElement
				}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onActionClick}>
						{spinnerActive && <Spinner />} Continue
					</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
