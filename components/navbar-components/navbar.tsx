"use client";

import Link from "next/link";
import {Sparkles} from "lucide-react";
import {Poppins} from "next/font/google";
import {UserButton} from "@clerk/nextjs";

import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {useProModal} from "@/hooks/use-pro-modal";
import {ModeToggle} from "@/components/navbar-components/theme-toggle";
import {MobileSidebar} from "@/components/navbar-components/mobile-sidebar";

const font = Poppins({
    weight: "600",
    subsets: ["latin"],
});

interface NavbarProps {
    isPro: boolean;
}

export const Navbar = ({isPro}: NavbarProps) => {
    const proModal = useProModal();

    return (
        <nav
            className="fixed w-full h-16 z-50 flex justify-between items-center py-2 px-4 border-b border-primary/10 bg-secondary">
            <div className="flex items-center">
                <MobileSidebar/>
                <Link href="/public">
                    <h1 className={cn(
                        "hidden md:block text-xl md:text-3xl font-bold text-primary",
                        font.className
                    )}>
                        companion.ai
                    </h1>
                </Link>
            </div>
            <div className="flex items-center gap-x-3">
                {!isPro && (
                    <Button onClick={proModal.onOpen} size="sm" variant="premium">
                        Upgrade
                        <Sparkles className="h-4 w-4 fill-white text-white ml-2"/>
                    </Button>
                )}
                <ModeToggle/>
                <UserButton afterSignOutUrl="/"/>
            </div>
        </nav>
    );
};
