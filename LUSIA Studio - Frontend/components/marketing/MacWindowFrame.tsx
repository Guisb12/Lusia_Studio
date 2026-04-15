"use client";

import React from "react";

interface MacWindowFrameProps {
  children: React.ReactNode;
  className?: string;
}

export function MacWindowFrame({ children, className = "" }: MacWindowFrameProps) {
  return (
    <div className={`relative rounded-xl overflow-hidden bg-white border border-gray-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] ${className}`}>
      {/* Mac window header - clean white style */}
      <div className="h-9 bg-white border-b border-gray-100 flex items-center px-4 relative">
        {/* Traffic lights - subtle gray dots */}
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
        </div>
        
        {/* LUSIA title - centered with ligature font */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-lusia text-sm font-medium text-gray-600 tracking-tight">
            LUSIA
          </span>
        </div>
      </div>
      
      {/* Content */}
      {children}
    </div>
  );
}
