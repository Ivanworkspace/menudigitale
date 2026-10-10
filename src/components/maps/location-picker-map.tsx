"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, useMap, useMapEvents } from "react-leaflet";

type Props = {
  lat: number | null;
  lng: number | null;
  radius: number;
  onPick: (lat: number, lng: number) => void;
};

const ITALY: [number, number] = [42.5, 12.5];

function ClickHandler({ onPick }: { onPick: Props["onPick"] }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null) map.setView([lat, lng], Math.max(map.getZoom(), 17));
  }, [lat, lng, map]);
  return null;
}

export default function LocationPickerMap({ lat, lng, radius, onPick }: Props) {
  const hasPoint = lat !== null && lng !== null;
  return (
    <MapContainer
      center={hasPoint ? [lat, lng] : ITALY}
      zoom={hasPoint ? 17 : 5}
      className="h-72 w-full rounded-lg ring-1 ring-slate-200"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      <Recenter lat={lat} lng={lng} />
      {hasPoint && (
        <>
          <Circle center={[lat, lng]} radius={radius} pathOptions={{ color: "#ea580c", fillOpacity: 0.12 }} />
          <CircleMarker center={[lat, lng]} radius={7} pathOptions={{ color: "#fff", fillColor: "#ea580c", fillOpacity: 1, weight: 2 }} />
        </>
      )}
    </MapContainer>
  );
}
