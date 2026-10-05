"use client";
import {useEffect} from "react";
export function ProfiAppearance({graphics}:{graphics:boolean}){useEffect(()=>{document.documentElement.dataset.profiGraphics=String(graphics);return()=>{delete document.documentElement.dataset.profiGraphics;};},[graphics]);return null;}
