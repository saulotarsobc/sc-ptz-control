import {
  ActionIcon,
  Avatar,
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconMessageCircle,
  IconPhone,
  IconSend,
  IconVideo,
} from "@tabler/icons-react";

const mockMessages = [
  {
    id: 1,
    name: "Alice Johnson",
    lastMessage: "Hey! How are you doing today?",
    time: "2 min ago",
    unread: 3,
    avatar: "AJ",
    online: true,
  },
  {
    id: 2,
    name: "Bob Smith",
    lastMessage: "Thanks for the help with the project!",
    time: "15 min ago",
    unread: 0,
    avatar: "BS",
    online: false,
  },
  {
    id: 3,
    name: "Carol Davis",
    lastMessage: "See you at the meeting tomorrow",
    time: "1 hour ago",
    unread: 1,
    avatar: "CD",
    online: true,
  },
  {
    id: 4,
    name: "David Wilson",
    lastMessage: "The files have been uploaded successfully",
    time: "3 hours ago",
    unread: 0,
    avatar: "DW",
    online: false,
  },
];

export function MessagesPage() {
  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <IconMessageCircle size={32} />
        <Title order={1}>Messages</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Stay connected with your contacts and manage conversations.
      </Text>

      <Stack gap="md">
        {mockMessages.map((message) => (
          <Card
            key={message.id}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
          >
            <Group justify="space-between">
              <Group>
                <div style={{ position: "relative" }}>
                  <Avatar color="blue" radius="xl">
                    {message.avatar}
                  </Avatar>
                  {message.online && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        backgroundColor: "var(--mantine-color-green-6)",
                        border: "2px solid white",
                      }}
                    />
                  )}
                </div>
                <div>
                  <Text fw={500}>{message.name}</Text>
                  <Text size="sm" c="dimmed">
                    {message.lastMessage}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {message.time}
                  </Text>
                </div>
              </Group>

              <Group gap="xs">
                {message.unread > 0 && (
                  <Badge color="blue" variant="filled" size="sm">
                    {message.unread}
                  </Badge>
                )}
                <ActionIcon variant="light" color="blue">
                  <IconPhone size={16} />
                </ActionIcon>
                <ActionIcon variant="light" color="green">
                  <IconVideo size={16} />
                </ActionIcon>
                <ActionIcon variant="light" color="gray">
                  <IconSend size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
