

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  // @ts-ignore
} from "@/common/components/ui/dialog"
import { ReactElement } from "react";

const Modal = ({
	modalContentElement,
	triggerElement,
	modalContentClassName = "",
	modalContentStyle = {},
	modalTitleElement,
}: {
	modalContentElement: ReactElement,
	triggerElement: ReactElement,
	modalContentClassName?: string,
	modalContentStyle?: {},
	modalTitleElement: ReactElement,
}) => {
  return (
    <div>
    	<Dialog>
				<DialogTrigger asChild>
					{triggerElement}
				</DialogTrigger>
				<DialogContent className={modalContentClassName}  style={modalContentStyle}>
					<DialogHeader>
						<DialogTitle>
							{modalTitleElement}
						</DialogTitle>
						<DialogDescription>
						</DialogDescription>
					</DialogHeader>
					{modalContentElement}
				</DialogContent>
			</Dialog>
    </div>
  )
}

export default Modal;
