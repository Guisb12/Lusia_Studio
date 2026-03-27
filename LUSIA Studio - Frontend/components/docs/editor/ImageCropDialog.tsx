"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImageCropDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    imageSrc: string;
    onCropDone: (blob: Blob) => void;
}

function cropImageToCanvas(
    image: HTMLImageElement,
    crop: PixelCrop,
): HTMLCanvasElement | null {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;

    ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
    );

    return canvas;
}

export function ImageCropDialog({
    open,
    onOpenChange,
    imageSrc,
    onCropDone,
}: ImageCropDialogProps) {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (!open) return;
        setCrop(undefined);
        setCompletedCrop(undefined);
    }, [open, imageSrc]);

    const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = Math.max(Math.round(rect.width || e.currentTarget.width || 0), 1);
        const height = Math.max(Math.round(rect.height || e.currentTarget.height || 0), 1);
        const nextCrop: Crop = {
            unit: "%",
            x: 5,
            y: 5,
            width: 90,
            height: 90,
        };
        setCrop(nextCrop);
        setCompletedCrop({
            unit: "px",
            x: Math.round(width * 0.05),
            y: Math.round(height * 0.05),
            width: Math.round(width * 0.9),
            height: Math.round(height * 0.9),
        });
    }, []);

    const handleConfirm = useCallback(() => {
        if (!completedCrop || !imgRef.current) return;

        const canvas = cropImageToCanvas(imgRef.current, completedCrop);
        if (!canvas) return;

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    onCropDone(blob);
                    onOpenChange(false);
                }
            },
            "image/png",
            1,
        );
    }, [completedCrop, onCropDone, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Recortar imagem</DialogTitle>
                </DialogHeader>

                <div className="flex justify-center max-h-[60vh] overflow-auto">
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            key={imageSrc}
                            ref={imgRef}
                            src={imageSrc}
                            alt="Imagem para recortar"
                            onLoad={handleImageLoad}
                            style={{ maxWidth: "100%", maxHeight: "55vh" }}
                        />
                    </ReactCrop>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={!completedCrop}>
                        Recortar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
