"use client";

import { useState } from "react";

import type { EventDetailDisplayMode, EventDetailModule, EventDetailModuleType } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventDetailModuleBuilderProps = {
  modules: EventDetailModule[];
  activeLang: ActiveLang;
  onChange(modules: EventDetailModule[]): void;
};

const moduleTypes: EventDetailModuleType[] = ["intro", "highlights", "itinerary", "notes", "fees", "refund", "contact", "custom"];
const displayModes: EventDetailDisplayMode[] = ["rich_text", "list"];

function createModule(type: EventDetailModuleType): EventDetailModule {
  const id = `${type}_${Date.now()}`;
  return {
    id,
    type,
    displayMode: type === "highlights" || type === "itinerary" ? "list" : "rich_text",
    title: { en: type.replaceAll("_", " "), zh: "" },
    content: { en: "", zh: "" },
    items: { en: [], zh: [] },
  };
}

function itemsToText(items: string[]) {
  return items.join("\n");
}

function textToItems(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function EventDetailModuleBuilder({ modules, activeLang, onChange }: EventDetailModuleBuilderProps) {
  const { t } = useLanguage();
  const [newType, setNewType] = useState<EventDetailModuleType>("intro");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  function updateModule(index: number, nextModule: EventDetailModule) {
    onChange(modules.map((moduleItem, moduleIndex) => (moduleIndex === index ? nextModule : moduleItem)));
  }

  function addModule() {
    onChange([...modules, createModule(newType)]);
  }

  function copyModule(index: number) {
    const source = modules[index];
    if (!source) return;
    const id = `${source.type}_${Date.now()}`;
    onChange([...modules.slice(0, index + 1), { ...source, id }, ...modules.slice(index + 1)]);
  }

  function deleteModule(index: number) {
    onChange(modules.filter((_, moduleIndex) => moduleIndex !== index));
  }

  function moveModule(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= modules.length) return;
    const nextModules = [...modules];
    const current = nextModules[index];
    const target = nextModules[nextIndex];
    if (!current || !target) return;
    nextModules[index] = target;
    nextModules[nextIndex] = current;
    onChange(nextModules);
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.eventDetailModules)}</h3>
        <div className="flex items-center gap-2">
          <select
            value={newType}
            onChange={(changeEvent) => {
              const selectedType = moduleTypes.find((type) => type === changeEvent.currentTarget.value);
              if (selectedType) setNewType(selectedType);
            }}
            className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700"
          >
            {moduleTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button type="button" onClick={addModule} className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-700">
            {t(adminCopy.editor.addModule)}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {modules.map((moduleItem, index) => {
          const isCollapsed = collapsedIds.has(moduleItem.id);
          return (
            <article key={moduleItem.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{moduleItem.title[activeLang] || moduleItem.type}</p>
                  <p className="text-xs text-gray-500">{moduleItem.type.replaceAll("_", " ")} / {moduleItem.displayMode.replaceAll("_", " ")}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => moveModule(index, -1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.moveUp)}
                  </button>
                  <button type="button" onClick={() => moveModule(index, 1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.moveDown)}
                  </button>
                  <button type="button" onClick={() => copyModule(index)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.copy)}
                  </button>
                  <button type="button" onClick={() => deleteModule(index)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600">
                    Delete
                  </button>
                  <button type="button" onClick={() => toggleCollapsed(moduleItem.id)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {isCollapsed ? t(adminCopy.editor.expand) : t(adminCopy.editor.collapse)}
                  </button>
                </div>
              </div>

              {!isCollapsed ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-gray-600">
                    Type
                    <select
                      value={moduleItem.type}
                      onChange={(changeEvent) => {
                        const selectedType = moduleTypes.find((type) => type === changeEvent.currentTarget.value);
                        if (selectedType) updateModule(index, { ...moduleItem, type: selectedType });
                      }}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    >
                      {moduleTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-600">
                    Mode
                    <select
                      value={moduleItem.displayMode}
                      onChange={(changeEvent) => {
                        const selectedMode = displayModes.find((mode) => mode === changeEvent.currentTarget.value);
                        if (selectedMode) updateModule(index, { ...moduleItem, displayMode: selectedMode });
                      }}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    >
                      {displayModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-600 md:col-span-2">
                    Title
                    <input
                      value={moduleItem.title[activeLang]}
                      onChange={(changeEvent) => updateModule(index, {
                        ...moduleItem,
                        title: { ...moduleItem.title, [activeLang]: changeEvent.currentTarget.value },
                      })}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    />
                  </label>
                  {moduleItem.displayMode === "list" ? (
                    <label className="block text-sm text-gray-600 md:col-span-2">
                      Items, one per line
                      <textarea
                        value={itemsToText(moduleItem.items[activeLang])}
                        onChange={(changeEvent) => updateModule(index, {
                          ...moduleItem,
                          items: { ...moduleItem.items, [activeLang]: textToItems(changeEvent.currentTarget.value) },
                        })}
                        rows={6}
                        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                      />
                    </label>
                  ) : (
                    <label className="block text-sm text-gray-600 md:col-span-2">
                      Content
                      <textarea
                        value={moduleItem.content[activeLang]}
                        onChange={(changeEvent) => updateModule(index, {
                          ...moduleItem,
                          content: { ...moduleItem.content, [activeLang]: changeEvent.currentTarget.value },
                        })}
                        rows={7}
                        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                      />
                    </label>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
