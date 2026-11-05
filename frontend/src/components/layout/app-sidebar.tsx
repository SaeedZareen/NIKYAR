import { NavLink, useLocation } from "react-router"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuth } from "@/app/auth"
import { visibleNavigation } from "@/app/navigation"

/** منوی درختی اصلی: گروه‌ها باز و بسته می‌شوند؛ در حالت جمع‌شده فقط آیکون‌ها دیده می‌شوند. */
export function AppSidebar() {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const { user, can } = useAuth()
  const groups = visibleNavigation(can, !!user?.is_superuser)

  return (
    <Sidebar side="right" collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]">
      <SidebarContent>
        {groups.map((group) => (
          <Collapsible key={group.title} defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full text-xs font-semibold text-sidebar-foreground">
                  {group.title}
                  <ChevronDown className="ms-auto transition-transform group-data-[state=closed]/collapsible:rotate-90" aria-hidden />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={item.url === "/" ? pathname === "/" : pathname.startsWith(item.url)} tooltip={item.title}>
                          <NavLink to={item.url} onClick={() => isMobile && setOpenMobile(false)}>
                            <item.icon aria-hidden />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
