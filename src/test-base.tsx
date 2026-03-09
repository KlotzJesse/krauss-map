import { Button } from "./components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip";

export default function Test() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<Button variant="outline" size="icon" />}>
          Hover me
        </TooltipTrigger>
        <TooltipContent>Content</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
