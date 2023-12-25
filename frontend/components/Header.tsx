import Link from "next/link";
import React from "react";

export default function Header() {
  const links = [
    { content: "COMANDO", href: "/" },
    { content: "PRESETS", href: "/page2" },
  ];

  return (
    <header>
      <nav>
        {links.map(({ content, href }, index) => (
          <Link
            key={index}
            className="underline text-blue-700 mr-2"
            href={href}
          >
            {content}
          </Link>
        ))}
      </nav>
    </header>
  );
}
