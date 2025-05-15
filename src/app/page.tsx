"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from 'next/link';
import { useChat } from "ai/react";
import Fuse from 'fuse.js';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare, Loader2, AlertCircle, Filter, XCircle, CalculatorIcon } from "lucide-react"; 
import protocolsData from "@/lib/protocols.json"; // Assuming this path is correct for your project setup
import { MedicationCalculator } from "@/components/MedicationCalculator";
import { useSearchParams, useRouter } from 'next/navigation';

interface Protocol {
  name: string;
  content: string;
  source_file: string;
  id: string;
  categories?: string[];
}

interface ProtocolData {
  [key: string]: Omit<Protocol, 'id' | 'categories'> & { categories?: string[] };
}

const protocolsList: Protocol[] = Object.entries(protocolsData as ProtocolData).map(([key, protocol]) => ({
    ...protocol,
    id: key,
    name: protocol.name || "Unnamed Protocol", 
    categories: protocol.categories || []
}));

const fuseOptions = {
  includeScore: true,
  threshold: 0.4,
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'id', weight: 0.5 },
    { name: 'content', weight: 0.2 }
  ]
};

const fuse = new Fuse(protocolsList, fuseOptions);

const CATEGORY_FILTERS = [
    { id: "adult", label: "Adult" },
    { id: "pediatric", label: "Pediatric" },
    { id: "medical", label: "Medical" },
    { id: "trauma", label: "Trauma" },
];

// Updated linkifyContent function V11 - Focus on linking protocol numbers
const linkifyContent = (content: string | undefined, allProtocols: Protocol[], currentProtocolId: string): (string | JSX.Element)[] => {
    console.log(`MANUS DEBUG V11: linkifyContent V11 (Number Linking) CALLED for protocol ID: ${currentProtocolId}, content snippet: ${content ? content.substring(0, 70) + "..." : "N/A"}`);
    if (!content) return ["Content not available."];

    const potentialMatches: { index: number; length: number; id: string; title: string; originalMatch: string }[] = [];
    const protocolNumberRegex = /\b(\d+(?:\.\d+)*)\b/g; // Matches numbers like 1.2, 22.34, 7, 1.2.3

    let regexMatch;
    while ((regexMatch = protocolNumberRegex.exec(content)) !== null) {
        const matchedNumberStr = regexMatch[1]; // The actual number string, e.g., "2.2"
        const foundIndex = regexMatch.index;
        const matchLength = matchedNumberStr.length;

        let protocolToLink: Protocol | undefined = undefined;
        let linkedId: string | undefined = undefined;

        // 1. Try direct match with the number string (e.g., ID "1.10")
        const directMatchProtocol = allProtocols.find(p => p.id === matchedNumberStr);
        if (directMatchProtocol && directMatchProtocol.id !== currentProtocolId) {
            protocolToLink = directMatchProtocol;
            linkedId = directMatchProtocol.id;
        }

        // 2. If no direct match, try converting dots to hyphens (e.g., "7.21" -> "7-21")
        if (!protocolToLink) {
            const convertedId = matchedNumberStr.replace(/\./g, '-');
            const convertedMatchProtocol = allProtocols.find(p => p.id === convertedId);
            if (convertedMatchProtocol && convertedMatchProtocol.id !== currentProtocolId) {
                protocolToLink = convertedMatchProtocol;
                linkedId = convertedMatchProtocol.id;
            }
        }
        
        if (protocolToLink && linkedId) {
            // Check if this number is part of a larger protocol name that was already matched by a previous, longer (name-based) match if we were to combine strategies.
            // For now, with number-only linking, this specific check might be less critical, but good to keep in mind for overlap resolution.
            potentialMatches.push({
                index: foundIndex,
                length: matchLength,
                id: linkedId, 
                title: protocolToLink.name, // Store the actual protocol name for title or other uses
                originalMatch: matchedNumberStr // This is the number string like "2.2"
            });
        } else {
            // console.log(`MANUS DEBUG V11: No protocol found for number: ${matchedNumberStr} (direct or converted) or it's the current protocol.`);
        }
    }

    // Sort potential matches: Longest first (less relevant for numbers, but good for consistency), then by start index.
    // For numbers, length is less variable, so index is primary sort for non-overlapping.
    potentialMatches.sort((a, b) => {
        if (a.length !== b.length) {
            return b.length - a.length; 
        }
        return a.index - b.index; 
    });

    const finalMatches: typeof potentialMatches = [];
    const coveredBitmap = new Array(content.length).fill(false); 

    for (const match of potentialMatches) {
        let canAddMatch = true;
        for (let i = match.index; i < match.index + match.length; i++) {
            if (i >= content.length) { 
                canAddMatch = false;
                break;
            }
            if (coveredBitmap[i]) {
                canAddMatch = false;
                break;
            }
        }

        if (canAddMatch) {
            finalMatches.push(match);
            for (let i = match.index; i < match.index + match.length; i++) {
                 if (i < content.length) { 
                    coveredBitmap[i] = true;
                 }
            }
        }
    }
    
    finalMatches.sort((a, b) => a.index - b.index);
    
    // console.log("MANUS DEBUG V11: linkifyContent - Final sorted & filtered matches:", finalMatches.map(m => ({id: m.id, index: m.index, length: m.length, original: m.originalMatch})));

    const result: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    finalMatches.forEach(match => {
        if (match.index > lastIndex) {
            result.push(content.substring(lastIndex, match.index));
        }
        const key = `${match.id}-${match.index}-${match.originalMatch.replace(/\./g, '-')}`;
        result.push(
            React.createElement(Link,
                { 
                    href: { pathname: '/', query: { protocol: match.id } },
                    key: key,
                    className: "text-blue-600 hover:text-blue-800 underline",
                    title: `Go to Protocol: ${match.title} (ID: ${match.id})`, // Add a helpful title attribute
                    onClick: (e: any) => console.log(`MANUS DEBUG V11: Link clicked for protocol ID: ${match.id}, linked text: '${match.originalMatch}'`)
                },
                match.originalMatch // Link text is just the number, e.g., "2.2"
            )
        );
        lastIndex = match.index + match.length;
    });

    if (lastIndex < content.length) {
        result.push(content.substring(lastIndex));
    }
    return result.length > 0 ? result : [content]; 
};

function ProtocolNavigatorPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Protocol[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

  console.log("MANUS DEBUG V8: ProtocolNavigatorPageContent rendering/re-rendering. SelectedProtocol ID:", selectedProtocol?.id);

  const { messages, input, handleInputChange: handleChatInputChange, handleSubmit, isLoading: isChatLoading, error: chatError } = useChat({
    api: "/api/chat",
  });

  const applyFiltersAndSearch = useCallback(() => {
    console.log("MANUS DEBUG V8: applyFiltersAndSearch called. Term:", searchTerm, "Filters:", activeFilters);
    const protocolIdFromQuery = searchParams.get('protocol');
    if (protocolIdFromQuery && !searchTerm && activeFilters.length === 0) {
        console.log("MANUS DEBUG V8: applyFiltersAndSearch - bailing early due to protocolIdFromQuery and no search/filters");
        return; 
    }

    let filteredByCategories = protocolsList;
    if (activeFilters.length > 0) {
        filteredByCategories = protocolsList.filter(protocol => 
            activeFilters.every(filter => protocol.categories?.includes(filter))
        );
    }
    if (!searchTerm.trim()) {
      setSearchResults(filteredByCategories);
      setIsSearching(false);
      console.log("MANUS DEBUG V8: applyFiltersAndSearch - no search term, set results to filteredByCategories");
      return;
    }
    setIsSearching(true);
    const fuseInstance = new Fuse(filteredByCategories, fuseOptions);
    const results = fuseInstance.search(searchTerm);
    const finalResults = results.map(result => result.item);
    setSearchResults(finalResults);
    setIsSearching(false);
    console.log("MANUS DEBUG V8: applyFiltersAndSearch - search complete, results count:", finalResults.length);
  }, [searchTerm, activeFilters, searchParams]);

  useEffect(() => {
    const protocolIdFromQuery = searchParams.get('protocol');
    console.log("MANUS DEBUG V8: useEffect[searchParams] - protocolIdFromQuery:", protocolIdFromQuery);
    if (protocolIdFromQuery) {
        const foundProtocol = protocolsList.find(p => p.id === protocolIdFromQuery);
        console.log("MANUS DEBUG V8: useEffect[searchParams] - foundProtocol:", foundProtocol?.id);
        if (foundProtocol) {
            if (selectedProtocol?.id !== foundProtocol.id) {
                console.log("MANUS DEBUG V8: useEffect[searchParams] - Setting selected protocol to:", foundProtocol.id);
                setSelectedProtocol(foundProtocol);
            }
            setIsChatMode(false);
            if (searchResults.length > 0) setSearchResults([]); 
            if (searchTerm) setSearchTerm(""); 
            if (activeFilters.length > 0) setActiveFilters([]);
        } else {
            console.warn("MANUS DEBUG V8: useEffect[searchParams] - Protocol ID from query not found, redirecting to home.");
            setSelectedProtocol(null);
            router.push('/');
        }
    } else {
        if (selectedProtocol) {
            console.log("MANUS DEBUG V8: useEffect[searchParams] - No protocolIdFromQuery, clearing selectedProtocol.");
            setSelectedProtocol(null);
        }
        applyFiltersAndSearch();
    }
  }, [searchParams, router, applyFiltersAndSearch, selectedProtocol, searchTerm, searchResults.length, activeFilters.length]);

  const handleSearchTermChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    if (selectedProtocol) {
        console.log("MANUS DEBUG V8: handleSearchTermChange - Clearing selected protocol due to search term change.");
        router.push('/'); 
        setSelectedProtocol(null); 
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { 
        console.log("MANUS DEBUG V8: Enter key pressed in search.");
    }
  };

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prevFilters => 
        prevFilters.includes(filterId) 
            ? prevFilters.filter(id => id !== filterId) 
            : [...prevFilters, filterId]
    );
    if (selectedProtocol) {
        console.log("MANUS DEBUG V8: toggleFilter - Clearing selected protocol due to filter change.");
        router.push('/'); 
        setSelectedProtocol(null);
    }
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    if (selectedProtocol) {
        console.log("MANUS DEBUG V8: clearAllFilters - Clearing selected protocol.");
        router.push('/');
        setSelectedProtocol(null);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const renderProtocolContent = useCallback(() => {
    if (!selectedProtocol) return null;
    console.log("MANUS DEBUG V8: renderProtocolContent - Rendering content for:", selectedProtocol.id);
    try {
        return linkifyContent(selectedProtocol.content, protocolsList, selectedProtocol.id);
    } catch (error) {
        console.error("MANUS DEBUG V8: Error in linkifyContent during render:", error);
        return <div className="text-red-500">Error rendering protocol content. Please check console.</div>;
    }
  }, [selectedProtocol]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <Card className="w-full max-w-4xl shadow-xl rounded-lg overflow-hidden">
        <CardHeader className="text-center bg-gray-800 text-white p-6">
            <div className="flex justify-between items-center">
                <div className="w-10 h-10"></div> 
                <CardTitle className="text-3xl md:text-4xl font-bold">EMS Protocol Navigator</CardTitle>
                <Button variant="outline" size="icon" onClick={() => setIsCalculatorOpen(true)} title="Open Medication Calculator" className="bg-gray-700 hover:bg-gray-600 border-gray-600 text-white">
                    <CalculatorIcon className="h-5 w-5" />
                </Button>
            </div>
            <CardDescription className="text-gray-300 mt-1">Search protocols or use AI chat for assistance</CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white">
            <div className="w-full flex items-center space-x-2 mb-4">
                <Input
                type="text"
                placeholder="Search protocols (e.g., cardiac arrest)..."
                value={searchTerm}
                onChange={handleSearchTermChange}
                onKeyDown={handleSearchKeyDown}
                className="flex-grow border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm text-gray-900"
                />
                <Button variant="outline" onClick={() => { setIsChatMode(!isChatMode); if (selectedProtocol) {router.push('/'); setSelectedProtocol(null);}}} title={isChatMode ? "Switch to Search View" : "Switch to AI Chat"} className="border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md">
                {isChatMode ? <Search className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />} <span className="ml-2 hidden sm:inline">{isChatMode ? "Search View" : "AI Chat"}</span>
                </Button>
            </div>

            {!isChatMode && !selectedProtocol && (
                <div className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 mr-2"><Filter className="h-4 w-4 inline-block mr-1 mb-px"/>Filters:</span>
                        {CATEGORY_FILTERS.map(filter => (
                            <Button 
                                key={filter.id} 
                                variant={activeFilters.includes(filter.id) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleFilter(filter.id)}
                                className={`rounded-full text-xs px-3 py-1 ${activeFilters.includes(filter.id) ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                            >
                                {filter.label}
                            </Button>
                        ))}
                        {activeFilters.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-red-500 hover:bg-red-100">
                                <XCircle className="h-4 w-4 mr-1"/> Clear All
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {isChatMode && (
                <div className="mt-6">
                    <h3 className="text-xl font-semibold mb-3 text-gray-800">AI Chat Assistant</h3>
                    <ScrollArea className="h-[400px] w-full border border-gray-200 rounded-md p-4 bg-gray-50 mb-4" ref={chatContainerRef}>
                        {messages.map((m, index) => (
                            <div key={index} className={`mb-3 p-3 rounded-lg shadow-sm ${m.role === 'user' ? 'bg-blue-100 text-blue-800 ml-auto' : 'bg-gray-200 text-gray-800 mr-auto'} max-w-[85%]`}>
                                <span className="font-semibold capitalize">{m.role === 'user' ? 'You' : 'AI'}: </span>
                                {m.content}
                            </div>
                        ))}
                        {isChatLoading && (
                            <div className="flex items-center justify-center text-gray-500">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span>Thinking...</span>
                            </div>
                        )}
                        {chatError && (
                            <div className="text-red-500 p-3 bg-red-50 border border-red-200 rounded-md">
                                <AlertCircle className="h-5 w-5 inline mr-2" /> Error: {chatError.message}
                            </div>
                        )}
                    </ScrollArea>
                    <form onSubmit={handleSubmit} className="flex items-center space-x-2">
                        <Input
                            value={input}
                            onChange={handleChatInputChange}
                            placeholder="Ask about protocols or medication..."
                            className="flex-grow border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm text-gray-900"
                            disabled={isChatLoading}
                        />
                        <Button type="submit" disabled={isChatLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md">
                            {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                        </Button>
                    </form>
                </div>
            )}

            {!isChatMode && selectedProtocol && (
                <div className="mt-6 prose max-w-none p-4 border border-gray-200 rounded-md bg-white shadow">
                    <h2 className="text-2xl font-bold mb-3 text-gray-900">{selectedProtocol.name}</h2>
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {renderProtocolContent()}
                    </div>
                    <Button variant="outline" onClick={() => {setSelectedProtocol(null); router.push('/');}} className="mt-6 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md">
                        Back to Search Results
                    </Button>
                </div>
            )}

            {!isChatMode && !selectedProtocol && searchResults.length > 0 && (
                <ScrollArea className="mt-6 h-[500px] border border-gray-200 rounded-md p-1 bg-white shadow">
                    <div className="p-3">
                    {searchResults.map(protocol => (
                        <Card 
                            key={protocol.id} 
                            className="mb-3 hover:shadow-md transition-shadow duration-200 cursor-pointer border-gray-200 hover:border-blue-400"
                            onClick={() => router.push(`/?protocol=${protocol.id}`)}
                        >
                            <CardHeader className="p-4">
                                <CardTitle className="text-lg text-blue-700 hover:text-blue-800">{protocol.name}</CardTitle>
                                {protocol.categories && protocol.categories.length > 0 && (
                                    <div className="text-xs text-gray-500 mt-1">
                                        Categories: {protocol.categories.join(", ")}
                                    </div>
                                )}
                            </CardHeader>
                        </Card>
                    ))}
                    </div>
                </ScrollArea>
            )}
            {!isChatMode && !selectedProtocol && searchTerm && searchResults.length === 0 && !isSearching && (
                 <div className="mt-6 text-center text-gray-500 p-6 bg-gray-50 rounded-md border border-gray-200">
                    <Search className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-lg font-medium">No protocols found matching "{searchTerm}".</p>
                    <p className="text-sm">Try a different search term or adjust your filters.</p>
                </div>
            )}

        </CardContent>
      </Card>
      {isCalculatorOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><Loader2 className="h-8 w-8 text-white animate-spin" /></div>}>
            <MedicationCalculator onClose={() => setIsCalculatorOpen(false)} />
        </Suspense>
      )}
      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} Twin Township Ambulance. All rights reserved.</p>
        <p className="text-xs mt-1">This tool is for reference only. Always follow local protocols and medical direction.</p>
      </footer>
    </div>
  );
}

// Main page export
export default function Page() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /> Loading Protocols...</div>}>
            <ProtocolNavigatorPageContent />
        </Suspense>
    );
}



