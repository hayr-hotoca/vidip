import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/common/components/ui/select";

type Item = {
	name: string,
	value: string,
}

export function SelectScrollable({
	placeholder,
	items,
	onValueChange,
	defaultValue,
	width = 180,
}: {
	placeholder: string,
	items: Item[],
	onValueChange: (text: string) => void,
	defaultValue?: string,
	width?: number,
}) {
	return (
		<Select defaultValue={defaultValue} onValueChange={onValueChange}>
			<SelectTrigger className={`w-[${width}px]`}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{items.map(item => (
					<SelectItem value={item.value} key={item.value}>{item.name}</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
