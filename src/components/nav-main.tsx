"use client";

import { IconCirclePlusFilled } from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import { memo } from "react";

import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// Optimize with memoization
const MemoizedSidebarMenuButton = memo(SidebarMenuButton);
MemoizedSidebarMenuButton.displayName = "MemoizedSidebarMenuButton";

export function NavMain({
  items,
  onCreateArea,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
  onCreateArea?: () => void;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <MemoizedSidebarMenuButton
              tooltip="Quick Create"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
              onClick={onCreateArea}
            >
              <IconCirclePlusFilled />
              <span>Neues Gebiet erstellen</span>
            </MemoizedSidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                render={<Link href={item.url as Route} />}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
                <LinkPendingIndicator />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
