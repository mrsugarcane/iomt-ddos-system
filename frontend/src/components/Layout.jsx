import React from "react";
import PulseGrid from "./PulseGrid";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen text-ink-primary font-body">
      <PulseGrid />
      <Sidebar />
      <MobileNav />
      <main className="md:ml-[220px] min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-10 py-8 md:py-12">{children}</div>
      </main>
    </div>
  );
}
