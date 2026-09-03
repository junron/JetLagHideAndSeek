import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
    selectedOutline?: boolean;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
    size: "default",
    variant: "default",
    selectedOutline: false,
});

type ToggleGroupProps = React.ComponentPropsWithoutRef<
    typeof ToggleGroupPrimitive.Root
> &
    VariantProps<typeof toggleVariants> & {
        selectedOutline?: boolean;
    };

const ToggleGroup = React.forwardRef<
    React.ElementRef<typeof ToggleGroupPrimitive.Root>,
    ToggleGroupProps
>(
    (
        {
            className,
            variant,
            size,
            selectedOutline = false,
            children,
            ...props
        },
        ref,
    ) => (
        <ToggleGroupPrimitive.Root
            ref={ref}
            className={cn("flex items-center justify-center gap-1", className)}
            {...props}
        >
            <ToggleGroupContext.Provider
                value={{ variant, size, selectedOutline }}
            >
                {children}
            </ToggleGroupContext.Provider>
        </ToggleGroupPrimitive.Root>
    ),
);

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
    React.ElementRef<typeof ToggleGroupPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
        VariantProps<typeof toggleVariants>
>(({ className, children, variant, size, ...props }, ref) => {
    const context = React.useContext(ToggleGroupContext);

    return (
        <ToggleGroupPrimitive.Item
            ref={ref}
            className={cn(
                toggleVariants({
                    variant: context.variant || variant,
                    size: context.size || size,
                }),
                context.selectedOutline &&
                    "data-[state=on]:outline data-[state=on]:outline-[3px] data-[state=on]:outline-green-500 data-[state=on]:outline-offset-[-3px]",
                className,
            )}
            {...props}
        >
            {children}
        </ToggleGroupPrimitive.Item>
    );
});

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
