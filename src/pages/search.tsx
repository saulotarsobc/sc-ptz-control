import {
  ActionIcon,
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconFilter,
  IconSearch,
  IconSortDescending,
} from "@tabler/icons-react";
import { useState } from "react";

const mockResults = [
  {
    id: 1,
    title: "React Documentation",
    description: "The library for web and native user interfaces",
    url: "https://react.dev",
    type: "Documentation",
  },
  {
    id: 2,
    title: "Mantine Components",
    description:
      "Build fully functional accessible web applications faster than ever",
    url: "https://mantine.dev",
    type: "UI Library",
  },
  {
    id: 3,
    title: "TypeScript Handbook",
    description: "TypeScript extends JavaScript by adding types",
    url: "https://www.typescriptlang.org",
    type: "Documentation",
  },
  {
    id: 4,
    title: "Electron Documentation",
    description:
      "Build cross-platform desktop apps with JavaScript, HTML, and CSS",
    url: "https://www.electronjs.org",
    type: "Framework",
  },
];

export function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredResults = mockResults.filter(
    (result) =>
      searchQuery === "" ||
      result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <IconSearch size={32} />
        <Title order={1}>Search</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Find what you're looking for quickly and efficiently.
      </Text>

      <Group mb="xl">
        <TextInput
          placeholder="Search for anything..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          style={{ flex: 1 }}
          size="md"
        />
        <ActionIcon size="lg" variant="light">
          <IconFilter size={20} />
        </ActionIcon>
        <ActionIcon size="lg" variant="light">
          <IconSortDescending size={20} />
        </ActionIcon>
      </Group>

      <Stack gap="md">
        {filteredResults.map((result) => (
          <Card key={result.id} shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={500} size="lg">
                {result.title}
              </Text>
              <Badge variant="light" color="blue">
                {result.type}
              </Badge>
            </Group>
            <Text c="dimmed" mb="sm">
              {result.description}
            </Text>
            <Text size="sm" c="blue" style={{ cursor: "pointer" }}>
              {result.url}
            </Text>
          </Card>
        ))}
      </Stack>

      {filteredResults.length === 0 && searchQuery !== "" && (
        <Card
          shadow="sm"
          padding="xl"
          radius="md"
          withBorder
          style={{ textAlign: "center" }}
        >
          <Text c="dimmed">No results found for "{searchQuery}"</Text>
        </Card>
      )}
    </Container>
  );
}
